import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { hash } from "argon2";
import request from "supertest";
import { createApp } from "../../apps/api/src/app";
import { digest, passwordOptions } from "../../apps/api/src/auth";
import { DatabaseService } from "../../apps/api/src/database.service";
import { businessRange, DashboardService } from "../../apps/api/src/dashboard";
import { settings } from "../../apps/api/src/config";
import { rolePermissions } from "../../apps/api/src/permissions";
import type { CurrentUser, DashboardData } from "../../packages/api-client/src";
type TestAgent = ReturnType<typeof request.agent>;

assert.equal(
  process.env.ERP_INTEGRATION_TEST,
  "true",
  "Run through npm test to isolate fixtures.",
);
assert(new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"));
const id = randomUUID().slice(0, 8);
const password = randomBytes(24).toString("base64url");
let app: INestApplication;
let db: DatabaseService;
let ownerId: string;
let staffId: string;
let owner: TestAgent;
let staff: TestAgent;
const origin = () => settings().origin;

async function csrf(agent: TestAgent) {
  const response = await agent.get("/api/v1/auth/csrf").expect(200);
  return response.body.data.token as string;
}
async function login(agent: TestAgent, login: string) {
  const token = await csrf(agent);
  return agent
    .post("/api/v1/auth/login")
    .set("Origin", origin())
    .set("X-CSRF-Token", token)
    .send({ login, password });
}
before(async () => {
  app = await createApp();
  await app.init();
  db = app.get(DatabaseService);
  for (const code of ["OWNER", "SALES_STAFF"] as const) {
    const role = await db.role.upsert({
      where: { code },
      update: {},
      create: { code, name: code },
    });
    for (const permissionCode of rolePermissions[code]) {
      const permission = await db.permission.upsert({
        where: { code: permissionCode },
        update: {},
        create: { code: permissionCode, name: permissionCode },
      });
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  const passwordHash = await hash(password, passwordOptions);
  for (const [login, roleCode] of [
    ["owner-" + id, "OWNER"],
    ["sales-" + id, "SALES_STAFF"],
  ]) {
    const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
    const user = await db.user.create({
      data: {
        login,
        name: "Isolated test user",
        passwordHash,
        roles: { create: { roleId: role.id } },
      },
    });
    if (roleCode === "OWNER") ownerId = user.id;
    else staffId = user.id;
  }
  owner = request.agent(app.getHttpServer());
  staff = request.agent(app.getHttpServer());
  assert.equal((await login(owner, "owner-" + id)).status, 201);
  assert.equal((await login(staff, "sales-" + id)).status, 201);
});
after(async () => {
  await app?.close();
});

test("supplier contacts enforce sessions, permissions, CSRF, and validated fields", async () => {
  const count = await db.supplier.count();
  const body = { name: "Supplier guard " + id, phone: "01712345678" };
  await request(app.getHttpServer()).get("/api/v1/suppliers").expect(401);
  await request(app.getHttpServer())
    .post("/api/v1/suppliers")
    .set("Origin", origin())
    .send(body)
    .expect(401);
  await staff.get("/api/v1/suppliers").expect(403);
  await staff
    .post("/api/v1/suppliers")
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(staff))
    .send(body)
    .expect(403);
  await owner
    .post("/api/v1/suppliers")
    .set("Origin", origin())
    .send(body)
    .expect(403);
  await owner
    .post("/api/v1/suppliers")
    .set("Origin", "https://untrusted.example")
    .set("X-CSRF-Token", await csrf(owner))
    .send(body)
    .expect(403);
  for (const invalid of [
    { ...body, name: "   " },
    { ...body, phone: "invalid" },
    { ...body, address: 123 },
    { ...body, address: "x".repeat(501) },
    { ...body, active: false },
    { ...body, openingBalance: "1000" },
  ])
    await owner
      .post("/api/v1/suppliers")
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .send(invalid)
      .expect(400);
  await owner.get("/api/v1/suppliers?page=0").expect(400);
  await owner.get("/api/v1/suppliers?pageSize=101").expect(400);
  await owner.get("/api/v1/suppliers?status=unknown").expect(400);
  assert.equal(await db.supplier.count(), count);
});

test("suppliers persist without an address, are audited, and can be searched and paged", async () => {
  const before = await db.supplier.count();
  const addresses = [undefined, "   ", null, "  Dhaka, Bangladesh  "];
  const created = [];
  for (const [index, address] of addresses.entries()) {
    const name = `Supplier ${id} ${index}`;
    const response = await owner
      .post("/api/v1/suppliers")
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .send({
        name: "  " + name + "  ",
        phone: "01712345678",
        company: "  Company " + id + "  ",
        address,
      })
      .expect(201);
    const supplier = response.body.data;
    created.push(supplier);
    assert.equal(supplier.name, name);
    assert.equal(supplier.company, "Company " + id);
    assert.equal(supplier.address, index === 3 ? "Dhaka, Bangladesh" : null);
    assert.equal(supplier.active, true);
    const stored = await db.supplier.findUniqueOrThrow({
      where: { id: supplier.id },
    });
    assert.equal(stored.address, supplier.address);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "SUPPLIER_CREATED", resourceId: supplier.id },
    });
    assert.equal(audit.actorId, ownerId);
    assert.equal(audit.requestId, response.headers["x-request-id"]);
  }
  assert.equal(await db.supplier.count(), before + 4);
  const first = (
    await owner.get(`/api/v1/suppliers?q=${id}&pageSize=1`).expect(200)
  ).body.data;
  const second = (
    await owner.get(`/api/v1/suppliers?q=${id}&pageSize=1&page=2`).expect(200)
  ).body.data;
  assert.equal(first.total, 4);
  assert.equal(first.items.length, 1);
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.equal(first.summary.total, before + 4);
  assert.equal("totalPayable" in first.items[0], false);
  await db.supplier.update({
    where: { id: created[0].id },
    data: { active: false },
  });
  const inactive = (
    await owner.get(`/api/v1/suppliers?q=${id}&status=inactive`).expect(200)
  ).body.data;
  assert.equal(inactive.total, 1);
  assert.equal(inactive.items[0].id, created[0].id);
});

test("catalog writes require permission, valid fields, Origin, and CSRF", async () => {
  await request(app.getHttpServer()).get("/api/v1/catalog").expect(401);
  await request(app.getHttpServer()).get("/api/v1/products").expect(401);
  await staff.get("/api/v1/catalog").expect(200);
  await staff.get("/api/v1/products").expect(200);
  const body = { name: "Denied type " + id, trackingKind: "QUANTITY" };
  await staff
    .post("/api/v1/product-types")
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(staff))
    .send(body)
    .expect(403);
  await staff
    .post("/api/v1/products")
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(staff))
    .send({})
    .expect(403);
  await owner
    .post("/api/v1/product-types")
    .set("Origin", origin())
    .send(body)
    .expect(403);
  await owner
    .post("/api/v1/product-types")
    .set("Origin", "https://untrusted.example")
    .set("X-CSRF-Token", await csrf(owner))
    .send(body)
    .expect(403);
  for (const invalid of [
    { ...body, name: "   " },
    { ...body, trackingKind: "CUSTOM" },
    { ...body, active: true },
  ])
    await owner
      .post("/api/v1/product-types")
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .send(invalid)
      .expect(400);
  await owner.get("/api/v1/catalog?typeId=invalid").expect(400);
  await owner.get("/api/v1/products?brandIds=invalid").expect(400);
  await owner.get("/api/v1/products?page=0").expect(400);
  await owner.get("/api/v1/products?pageSize=101").expect(400);
});

test("public API requires the Cloudflare proxy secret while health remains available", async () => {
  const previous = process.env.API_PROXY_SECRET;
  const secret = randomBytes(32).toString("hex");
  let proxyApp: INestApplication | undefined;
  try {
    process.env.API_PROXY_SECRET = secret;
    proxyApp = await createApp();
    await proxyApp.init();
    const server = proxyApp.getHttpServer();
    await request(server).get("/api/v1/health").expect(200);
    await request(server).get("/api/v1/auth/csrf").expect(403);
    await request(server)
      .get("/api/v1/auth/csrf")
      .set("X-ERP-Proxy-Secret", "incorrect")
      .set("X-ERP-Client-IP", "192.0.2.1")
      .expect(403);
    await request(server)
      .get("/api/v1/auth/csrf")
      .set("X-ERP-Proxy-Secret", secret)
      .expect(200);
    await request(server)
      .get("/api/v1/auth/me")
      .set("X-ERP-Proxy-Secret", secret)
      .expect(401);
  } finally {
    if (previous === undefined) delete process.env.API_PROXY_SECRET;
    else process.env.API_PROXY_SECRET = previous;
    await proxyApp?.close();
  }
});

test("fixed product categories and their products persist, filter, and count without creating stock", async () => {
  async function create(path: string, body: object, status = 201) {
    return owner
      .post("/api/v1/" + path)
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .send(body)
      .expect(status);
  }
  const categoryCountsBefore = new Map(
    (
      await db.productType.findMany({
        include: {
          _count: { select: { products: { where: { active: true } } } },
        },
      })
    ).map((type) => [type.id, type._count.products]),
  );
  const stockBefore = await db.stockBatch.count();
  const unitsBefore = await db.batteryUnit.count();
  const productCount = await db.product.count();
  const quantity = await db.productType.findUniqueOrThrow({
    where: { code: "PARTS" },
  });
  const individual = await db.productType.findUniqueOrThrow({
    where: { code: "BATTERY" },
  });
  const empty = await db.productType.findUniqueOrThrow({
    where: { code: "EASY_BIKE_RICKSHAW" },
  });
  await create(
    "product-types",
    { name: "  CABLES " + id + "  ", trackingKind: "QUANTITY" },
    409,
  );
  const part = {
    typeId: quantity.id,
    name: "Wire " + id,
    model: "1m",
    unit: "piece",
    brand: "Maker " + id,
    category: "Electrical " + id,
    defaultSellingPrice: "125.50",
    lowStockThreshold: "1.5",
    specifications: "Copper",
    warrantyMonths: 6,
  };
  const battery = {
    typeId: individual.id,
    name: "Cell " + id,
    unit: "piece",
    defaultSellingPrice: "15000.00",
    capacityAh: "200",
    voltage: "12",
    identificationMethod: "BOTH",
    warrantyMonths: 18,
  };
  const createdPart = (await create("products", part)).body.data;
  const createdBattery = (await create("products", battery)).body.data;
  assert.equal(createdPart.type.id, quantity.id);
  assert.equal(createdPart.type.trackingKind, "QUANTITY");
  assert.equal(createdPart.category.name, "Electrical " + id);
  assert.equal(createdPart.defaultSellingPrice, "125.50");
  assert.equal(createdBattery.type.id, individual.id);
  assert.equal(createdBattery.brand, null);
  assert.equal(createdBattery.identificationMethod, "BOTH");
  assert.equal(createdBattery.warrantyMonths, 18);
  assert.equal("defaultPurchasePrice" in createdPart, false);
  await create("products", part, 409);
  for (const invalid of [
    { ...part, category: "" },
    { ...part, name: " " },
    { ...part, typeId: randomUUID() },
    { ...part, defaultSellingPrice: "-1" },
    { ...part, defaultSellingPrice: "1.234" },
    { ...part, capacityAh: "12" },
    { ...battery, capacityAh: undefined },
    { ...battery, identificationMethod: undefined },
    { ...battery, voltage: "0" },
    { ...battery, defaultPurchasePrice: "100" },
  ])
    await create("products", invalid, 400);
  assert.equal(await db.product.count(), productCount + 2);
  assert.equal(await db.stockBatch.count(), stockBefore);
  assert.equal(await db.batteryUnit.count(), unitsBefore);
  assert(
    await db.partsProductDetail.findUnique({
      where: { productId: createdPart.id },
    }),
  );
  assert(
    await db.batteryProductDetail.findUnique({
      where: { productId: createdBattery.id },
    }),
  );
  const metadata = (
    await owner.get(`/api/v1/catalog?typeId=${quantity.id}`).expect(200)
  ).body.data;
  for (const [type, count] of [
    [quantity, 1],
    [individual, 1],
    [empty, 0],
  ] as const)
    assert.equal(
      metadata.types.find((row: { id: string }) => row.id === type.id)
        .productCount,
      (categoryCountsBefore.get(type.id) ?? 0) + count,
    );
  assert.equal(
    metadata.categories.find(
      (row: { id: string }) => row.id === createdPart.category.id,
    ).productCount,
    1,
  );
  const filtered = (
    await owner
      .get(
        `/api/v1/products?typeId=${quantity.id}&brandIds=${createdPart.brand.id}&categoryId=${createdPart.category.id}`,
      )
      .expect(200)
  ).body.data;
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0].id, createdPart.id);
  const first = (
    await owner.get(`/api/v1/products?q=${id}&pageSize=1`).expect(200)
  ).body.data;
  const second = (
    await owner.get(`/api/v1/products?q=${id}&pageSize=1&page=2`).expect(200)
  ).body.data;
  assert.equal(first.total, 2);
  assert.notEqual(first.items[0].id, second.items[0].id);
  const audits = await db.auditLog.count({
    where: {
      resourceId: {
        in: [
          quantity.id,
          individual.id,
          empty.id,
          createdPart.id,
          createdBattery.id,
        ],
      },
      actorId: ownerId,
    },
  });
  assert.equal(audits, 2);
});

test("product-name groups retain empty links and count and filter separately within each fixed category", async () => {
  async function create(path: string, body: object) {
    return (
      await owner
        .post("/api/v1/" + path)
        .set("Origin", origin())
        .set("X-CSRF-Token", await csrf(owner))
        .send(body)
        .expect(201)
    ).body.data;
  }
  const batteryType = await db.productType.findUniqueOrThrow({
    where: { code: "BATTERY" },
  });
  const partsType = await db.productType.findUniqueOrThrow({
    where: { code: "PARTS" },
  });
  const emptyType = await db.productType.findUniqueOrThrow({
    where: { code: "EASY_BIKE_RICKSHAW" },
  });
  const groupName = "Shared product name " + id;
  const shared = await create("categories", {
    typeId: batteryType.id,
    name: groupName,
  });
  await create("categories", { typeId: emptyType.id, name: groupName });
  const empty = await create("categories", {
    typeId: partsType.id,
    name: "Unused product name " + id,
  });
  const battery = await create("products", {
    typeId: batteryType.id,
    name: "Grouped battery variant " + id,
    unit: "pcs",
    category: groupName,
    capacityAh: "150",
    voltage: "12",
    identificationMethod: "SERIAL",
  });
  const parts: { id: string }[] = [];
  for (const model of ["Small", "Large"])
    parts.push(
      await create("products", {
        typeId: partsType.id,
        name: "Grouped part variant " + id,
        model,
        unit: "pcs",
        category: groupName,
      }),
    );
  assert.equal(battery.brand, null);
  assert.equal(battery.category.id, shared.id);
  const all = (await owner.get("/api/v1/catalog").expect(200)).body.data;
  const group = all.categories.find(
    (row: { id: string }) => row.id === shared.id,
  );
  assert.deepEqual(
    new Set(group.typeIds),
    new Set([batteryType.id, partsType.id, emptyType.id]),
  );
  assert.equal(group.productCount, 3);
  assert.deepEqual(group.productCountsByType, {
    [batteryType.id]: 1,
    [partsType.id]: 2,
    [emptyType.id]: 0,
  });
  const unused = all.categories.find(
    (row: { id: string }) => row.id === empty.id,
  );
  assert.deepEqual(unused.typeIds, [partsType.id]);
  assert.equal(unused.productCount, 0);
  assert.deepEqual(unused.productCountsByType, { [partsType.id]: 0 });
  const scoped = (
    await owner.get(`/api/v1/catalog?typeId=${partsType.id}`).expect(200)
  ).body.data.categories.find((row: { id: string }) => row.id === shared.id);
  assert.equal(scoped.productCount, 2);
  assert.deepEqual(scoped.productCountsByType, group.productCountsByType);
  for (const [type, expected] of [
    [batteryType, [battery.id]],
    [partsType, parts.map((part) => part.id)],
    [emptyType, []],
  ] as const) {
    const filtered = (
      await owner
        .get(`/api/v1/products?typeId=${type.id}&categoryId=${shared.id}`)
        .expect(200)
    ).body.data;
    assert.equal(filtered.total, expected.length);
    assert.deepEqual(
      new Set(filtered.items.map((item: { id: string }) => item.id)),
      new Set(expected),
    );
  }
});

test("product-name deletion requires confirmation and write access, unlinks only its selected type, and preserves used names", async () => {
  const create = async (path: string, body: object) =>
    (
      await owner
        .post("/api/v1/" + path)
        .set("Origin", origin())
        .set("X-CSRF-Token", await csrf(owner))
        .send(body)
        .expect(201)
    ).body.data;
  const firstType = await db.productType.findUniqueOrThrow({
    where: { code: "PARTS" },
  });
  const otherType = await db.productType.findUniqueOrThrow({
    where: { code: "EASY_BIKE_RICKSHAW" },
  });
  const name = "Shared deletable name " + id;
  const category = await create("categories", { typeId: firstType.id, name });
  assert.equal(
    (await create("categories", { typeId: otherType.id, name })).id,
    category.id,
  );
  const path = "/api/v1/categories/" + category.id;
  const body = { typeId: firstType.id, confirmed: true };
  const remove = async (payload: object, route = path) =>
    owner
      .delete(route)
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .send(payload);
  const auditCount = () =>
    db.auditLog.count({
      where: { action: "PRODUCT_NAME_DELETED", resourceId: category.id },
    });
  const beforeAudit = await auditCount();
  await request(app.getHttpServer())
    .delete(path)
    .set("Origin", origin())
    .send(body)
    .expect(401);
  await staff
    .delete(path)
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(staff))
    .send(body)
    .expect(403);
  await owner.delete(path).set("Origin", origin()).send(body).expect(403);
  await owner
    .delete(path)
    .set("Origin", "https://untrusted.example")
    .set("X-CSRF-Token", await csrf(owner))
    .send(body)
    .expect(403);
  for (const invalid of [
    {},
    { typeId: firstType.id },
    { ...body, confirmed: false },
    { ...body, confirmed: "true" },
    { ...body, typeId: "invalid" },
    { ...body, unexpected: true },
  ])
    assert.equal((await remove(invalid)).status, 400);
  assert.equal((await remove(body, "/api/v1/categories/invalid")).status, 400);
  assert.equal((await remove({ ...body, typeId: randomUUID() })).status, 404);
  assert.equal(await auditCount(), beforeAudit);
  assert.equal(
    await db.productTypeCategory.count({ where: { categoryId: category.id } }),
    2,
  );
  const product = await create("products", {
    typeId: otherType.id,
    name: "Protected product variant " + id,
    unit: "pcs",
    category: name,
  });

  const removed = await remove(body);
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.deepEqual(removed.body.data, { deleted: true });
  assert.deepEqual(
    (
      await db.productTypeCategory.findMany({
        where: { categoryId: category.id },
        select: { typeId: true },
      })
    ).map((link) => link.typeId),
    [otherType.id],
  );
  assert(await db.category.findUnique({ where: { id: category.id } }));
  const audit = await db.auditLog.findFirstOrThrow({
    where: { action: "PRODUCT_NAME_DELETED", resourceId: category.id },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(audit.actorId, ownerId);
  assert.equal(audit.requestId, removed.headers["x-request-id"]);
  assert.equal(audit.resourceType, "Category");
  assert.deepEqual(audit.metadata, { typeId: firstType.id, name });
  const metadata = (await owner.get("/api/v1/catalog").expect(200)).body.data;
  assert.deepEqual(
    metadata.categories.find((item: { id: string }) => item.id === category.id)
      .typeIds,
    [otherType.id],
  );
  assert.equal((await remove(body)).status, 404);
  assert.equal(await auditCount(), beforeAudit + 1);

  // All products (including inactive ones) protect their own link.
  for (const active of [true, false]) {
    await db.product.update({ where: { id: product.id }, data: { active } });
    const result = await remove({ typeId: otherType.id, confirmed: true });
    assert.equal(result.status, 409, JSON.stringify(result.body));
  }
  assert(await db.product.findUnique({ where: { id: product.id } }));
  assert(
    await db.productTypeCategory.findUnique({
      where: {
        typeId_categoryId: { typeId: otherType.id, categoryId: category.id },
      },
    }),
  );
  assert.equal(await auditCount(), beforeAudit + 1);

  // Even after the last empty link is removed concurrently, the shared name record/history remains.
  const empty = await create("categories", {
    typeId: firstType.id,
    name: "Last empty product name " + id,
  });
  const race = await Promise.all([
    remove(body, "/api/v1/categories/" + empty.id),
    remove(body, "/api/v1/categories/" + empty.id),
  ]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 404]);
  assert.equal(
    await db.productTypeCategory.count({ where: { categoryId: empty.id } }),
    0,
  );
  assert(await db.category.findUnique({ where: { id: empty.id } }));
  assert.equal(
    await db.auditLog.count({
      where: { action: "PRODUCT_NAME_DELETED", resourceId: empty.id },
    }),
    1,
  );
});

test("dashboard trend uses posted revenue less COGS at Dhaka date boundaries", async () => {
  const service = app.get(DashboardService);
  const before = await service.get(true, "2026-01-02", "2026-01-02");
  const accounts = await Promise.all(
    [
      ["4100", "REVENUE"],
      ["5100", "EXPENSE"],
      ["trend-cash-" + id, "ASSET"],
    ].map(([code, kind]) =>
      db.account.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name: "Isolated trend fixture",
          kind: kind as "REVENUE" | "EXPENSE" | "ASSET",
        },
      }),
    ),
  );
  await db.$transaction(async (tx) => {
    const posting = await tx.posting.create({
      data: { actorId: ownerId, kind: "TEST", sourceCode: "trend-" + id },
    });
    await tx.journalEntry.create({
      data: {
        postingId: posting.id,
        postedAt: new Date("2026-01-01T20:00:00Z"),
        lines: {
          create: [
            { accountId: accounts[2].id, debit: 100, credit: 0 },
            { accountId: accounts[0].id, debit: 0, credit: 100 },
            { accountId: accounts[1].id, debit: 70, credit: 0 },
            { accountId: accounts[2].id, debit: 0, credit: 70 },
          ],
        },
      },
    });
  });
  const data = await service.get(true, "2026-01-02", "2026-01-02");
  assert.equal(data.salesTrend.length, 1);
  assert.equal(data.salesTrend[0].date, "2026-01-02");
  assert.equal(
    Number(data.salesTrend[0].amount) -
      Number(before.salesTrend[0]?.amount ?? 0),
    100,
  );
  assert.equal(
    Number(data.salesTrend[0].grossProfit) -
      Number(before.salesTrend[0]?.grossProfit ?? 0),
    30,
  );
  assert.equal(
    Number(data.financials?.grossProfit) -
      Number(before.financials?.grossProfit),
    30,
  );
  assert.deepEqual(
    (await service.get(false, "2026-01-02", "2026-01-02")).salesTrend,
    [],
  );
});

test("unauthenticated business requests are denied; health connects to migrated PostgreSQL", async () => {
  await request(app.getHttpServer()).get("/api/v1/dashboard").expect(401);
  const response = await request(app.getHttpServer())
    .get("/api/v1/health")
    .expect(200);
  assert.equal(response.body.data.database, "connected");
});
test("login validates CSRF, Origin, DTO fields, and generic failure", async () => {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post("/api/v1/auth/login")
    .set("Origin", origin())
    .send({ login: "owner", password })
    .expect(403);
  const token = await csrf(agent);
  await agent
    .post("/api/v1/auth/login")
    .set("Origin", "https://example.invalid")
    .set("X-CSRF-Token", token)
    .send({ login: "owner", password })
    .expect(403);
  await agent
    .post("/api/v1/auth/login")
    .set("Origin", origin())
    .set("X-CSRF-Token", token)
    .send({ login: "owner", password, roles: ["OWNER"] })
    .expect(400);
  const wrong = await agent
    .post("/api/v1/auth/login")
    .set("Origin", origin())
    .set("X-CSRF-Token", token)
    .send({ login: "unknown-" + id, password })
    .expect(401);
  assert.equal(wrong.body.error.message, "Invalid login or password.");
});
test("session and password secrets are hashed; user DTO has permission codes without hashes", async () => {
  const response = await owner.get("/api/v1/auth/me").expect(200);
  const user = response.body.data as CurrentUser;
  assert(user.permissions.includes("finance.read"));
  assert(!JSON.stringify(user).includes("passwordHash"));
  const stored = await db.user.findUniqueOrThrow({ where: { id: ownerId } });
  assert(stored.passwordHash.startsWith("$argon2id$"));
  assert.notEqual(stored.passwordHash, password);
  const sessions = await db.session.findMany({ where: { userId: ownerId } });
  assert(sessions.length > 0);
  assert.match(sessions[0].tokenHash, /^[a-f0-9]{64}$/);
});
test("finance data is omitted for sales staff and direct finance/users/settings access is denied", async () => {
  const response = await staff.get("/api/v1/dashboard").expect(200);
  assert(!Object.hasOwn(response.body.data, "financials"));
  assert.deepEqual(response.body.data.salesTrend, []);
  for (const route of [
    "/reports/financial-summary",
    "/users",
    "/roles",
    "/settings/shop",
    "/audit-logs",
    "/modules/accounts",
  ])
    await staff.get("/api/v1" + route).expect(403);
});
test("owner dashboard returns actual empty accounting totals and validates Dhaka date ranges", async () => {
  const response = await owner
    .get("/api/v1/dashboard?from=2026-11-01&to=2026-11-13")
    .expect(200);
  const data = response.body.data as DashboardData;
  assert.equal(data.financials?.todaySales, "0.00");
  assert.equal(data.from, "2026-11-01");
  await owner.get("/api/v1/dashboard?from=2026-02-31").expect(400);
  await owner
    .get("/api/v1/dashboard?from=2026-12-01&to=2026-11-01")
    .expect(400);
  assert.equal(
    businessRange("2026-11-13", "2026-11-13").start.toISOString(),
    "2026-11-12T18:00:00.000Z",
  );
});
test("session rotation revokes the prior token; logout requires CSRF and revokes the session", async () => {
  const agent = request.agent(app.getHttpServer());
  const first = await login(agent, "owner-" + id);
  assert.equal(first.status, 201);
  const rawCookie = (first.headers["set-cookie"] as unknown as string[]).find(
    (cookie) => cookie.startsWith(settings().cookieName + "="),
  )!;
  assert(rawCookie.includes("HttpOnly"));
  assert(rawCookie.includes("SameSite=Lax"));
  assert(rawCookie.includes("Path=/"));
  const raw = rawCookie.split(";")[0].slice(settings().cookieName.length + 1);
  assert.equal((await login(agent, "owner-" + id)).status, 201);
  assert(
    (await db.session.findUniqueOrThrow({ where: { tokenHash: digest(raw) } }))
      .revokedAt,
  );
  await agent
    .post("/api/v1/auth/logout")
    .set("Origin", origin())
    .send({})
    .expect(403);
  await agent
    .post("/api/v1/auth/logout")
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(agent))
    .send({})
    .expect(201);
  await agent.get("/api/v1/auth/me").expect(401);
});
test("disabled users and expired/idle sessions cannot access the workspace", async () => {
  await db.user.update({ where: { id: staffId }, data: { active: false } });
  await staff.get("/api/v1/auth/me").expect(401);
  await db.user.update({ where: { id: staffId }, data: { active: true } });
  for (const expired of [false, true]) {
    const raw = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        userId: staffId,
        tokenHash: digest(raw),
        csrfTokenHash: digest("unused"),
        createdAt: new Date(Date.now() - 3 * 3600000),
        lastSeenAt: new Date(Date.now() - 2 * 3600000),
        expiresAt: new Date(Date.now() + (expired ? -3600000 : 3600000)),
      },
    });
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", settings().cookieName + "=" + raw)
      .expect(401);
  }
});
test("permission changes are effective on the next request", async () => {
  const assignment = await db.userRole.findFirstOrThrow({
    where: { userId: staffId },
  });
  await db.userRole.delete({ where: { id: assignment.id } });
  await staff.get("/api/v1/dashboard").expect(403);
  await db.userRole.create({
    data: { userId: staffId, roleId: assignment.roleId },
  });
});
test("persistent login rate limiting returns 429 without disclosing account existence", async () => {
  const agent = request.agent(app.getHttpServer());
  const token = await csrf(agent);
  for (let i = 0; i < 10; i++)
    await agent
      .post("/api/v1/auth/login")
      .set("Origin", origin())
      .set("X-CSRF-Token", token)
      .send({ login: "limited-" + id, password })
      .expect(401);
  const response = await agent
    .post("/api/v1/auth/login")
    .set("Origin", origin())
    .set("X-CSRF-Token", token)
    .send({ login: "limited-" + id, password })
    .expect(429);
  assert.equal(response.headers["retry-after"], "900");
});
test("database rejects unbalanced journals, preserves balanced entries, and prevents audit mutation", async () => {
  const a = await db.account.create({
    data: { code: "test-a-" + id, name: "Isolated asset", kind: "ASSET" },
  });
  const b = await db.account.create({
    data: { code: "test-b-" + id, name: "Isolated equity", kind: "EQUITY" },
  });
  const source = "unbalanced-" + id;
  await assert.rejects(
    db.$transaction(async (tx) => {
      const posting = await tx.posting.create({
        data: { kind: "TEST", sourceCode: source, actorId: ownerId },
      });
      await tx.journalEntry.create({
        data: {
          postingId: posting.id,
          lines: {
            create: [
              { accountId: a.id, debit: "10", credit: "0" },
              { accountId: b.id, debit: "0", credit: "9" },
            ],
          },
        },
      });
    }),
  );
  assert.equal(await db.posting.count({ where: { sourceCode: source } }), 0);
  const balanced = await db.$transaction(async (tx) => {
    const posting = await tx.posting.create({
      data: { kind: "TEST", sourceCode: "balanced-" + id, actorId: ownerId },
    });
    return tx.journalEntry.create({
      data: {
        postingId: posting.id,
        lines: {
          create: [
            { accountId: a.id, debit: "10", credit: "0" },
            { accountId: b.id, debit: "0", credit: "10" },
          ],
        },
      },
    });
  });
  await assert.rejects(
    db.journalEntry.update({
      where: { id: balanced.id },
      data: { reason: "overwrite" },
    }),
  );
  const audit = await db.auditLog.findFirstOrThrow();
  await assert.rejects(db.auditLog.delete({ where: { id: audit.id } }));
});
test("database preserves repeated production dates, unique unit IDs, normalized serial uniqueness, and identity immutability", async () => {
  const type = await db.productType.create({
    data: {
      code: "test-battery-" + id,
      name: "Test battery",
      trackingKind: "BATTERY_UNIT",
    },
  });
  const brand = await db.brand.create({
    data: { name: "Isolated brand " + id, normalizedName: "isolated-" + id },
  });
  for (const method of ["PRODUCTION_DATE", "SERIAL"] as const) {
    const product = await db.product.create({
      data: {
        sku: "test-" + method + id,
        name: "Isolated test product",
        model: id,
        identityKey: method + id,
        unit: "piece",
        typeId: type.id,
        brandId: brand.id,
        batteryDetail: {
          create: {
            capacityAh: 100,
            voltage: 12,
            identificationMethod: method,
          },
        },
      },
    });
    const posting = await db.posting.create({
      data: {
        actorId: ownerId,
        kind: "TEST_OPENING",
        sourceCode: "opening-" + method + id,
      },
    });
    const opening = await db.openingBalance.create({
      data: {
        number: "open-" + method + id,
        postingId: posting.id,
        reason: "Isolated schema test",
        reconciliationReference: id,
      },
    });
    const item = await db.openingBalanceItem.create({
      data: {
        openingId: opening.id,
        deduplicationKey: "opening-item-" + method + id,
        kind: "STOCK",
        details: {},
      },
    });
    const batch = await db.stockBatch.create({
      data: {
        productId: product.id,
        origin: "OPENING",
        originalQuantity: 2,
        unitCost: 12000,
        openingItemId: item.id,
      },
    });
    const first = await db.batteryUnit.create({
      data: {
        productId: product.id,
        batchId: batch.id,
        internalCode: "unit-a-" + method + id,
        origin: "OPENING",
        productionDate: new Date("2026-10-01"),
        ...(method === "SERIAL" ? { serialNumber: "serial-" + id } : {}),
      },
    });
    if (method === "PRODUCTION_DATE") {
      const second = await db.batteryUnit.create({
        data: {
          productId: product.id,
          batchId: batch.id,
          internalCode: "unit-b-" + method + id,
          origin: "OPENING",
          productionDate: new Date("2026-10-01"),
        },
      });
      assert.notEqual(first.internalCode, second.internalCode);
      assert.equal(
        first.productionDate?.toISOString(),
        second.productionDate?.toISOString(),
      );
    } else
      await assert.rejects(
        db.batteryUnit.create({
          data: {
            productId: product.id,
            batchId: batch.id,
            internalCode: "unit-b-" + method + id,
            origin: "OPENING",
            serialNumber: " SERIAL-" + id.toUpperCase() + " ",
          },
        }),
      );
    await assert.rejects(
      db.batteryUnit.update({
        where: { id: first.id },
        data: { serialNumber: "rewritten" },
      }),
    );
    await assert.rejects(
      db.batteryUnit.update({
        where: { id: first.id },
        data: { commercialState: "AVAILABLE", condition: "FAULTY" },
      }),
    );
    await assert.rejects(
      db.inventoryBalance.create({
        data: {
          batchId: batch.id,
          location: "SHOP",
          bucket: "AVAILABLE",
          quantity: -1,
        },
      }),
    );
  }
});

test("replacement lineage can be created atomically without breaking the batch-unit-receipt foreign-key cycle", async () => {
  const type = await db.productType.create({
    data: {
      code: "lineage-type-" + id,
      name: "Isolated battery",
      trackingKind: "BATTERY_UNIT",
    },
  });
  const brand = await db.brand.create({
    data: { name: "Lineage test", normalizedName: "lineage-brand-" + id },
  });
  const product = await db.product.create({
    data: {
      sku: "lineage-sku-" + id,
      name: "Lineage test battery",
      model: id,
      identityKey: "lineage-product-" + id,
      unit: "piece",
      typeId: type.id,
      brandId: brand.id,
      batteryDetail: {
        create: {
          capacityAh: 100,
          voltage: 12,
          identificationMethod: "PRODUCTION_DATE",
        },
      },
    },
  });
  const opening = await db.openingBalance.create({
    data: {
      number: "lineage-open-" + id,
      reason: "Isolated schema fixture",
      reconciliationReference: id,
      posting: {
        create: {
          actorId: ownerId,
          kind: "TEST",
          sourceCode: "lineage-open-post-" + id,
        },
      },
      items: {
        create: {
          kind: "STOCK",
          deduplicationKey: "lineage-open-item-" + id,
          details: {},
        },
      },
    },
    include: { items: true },
  });
  const oldBatch = await db.stockBatch.create({
    data: {
      productId: product.id,
      origin: "OPENING",
      originalQuantity: 1,
      unitCost: 12000,
      openingItemId: opening.items[0].id,
    },
  });
  const oldUnit = await db.batteryUnit.create({
    data: {
      productId: product.id,
      batchId: oldBatch.id,
      origin: "OPENING",
      internalCode: "lineage-old-" + id,
      productionDate: new Date("2026-10-01"),
      condition: "FAULTY",
      custody: "SUPPLIER",
    },
  });
  const supplier = await db.supplier.create({
    data: { name: "Isolated lineage supplier " + id },
  });
  const replacement = await db.replacementRecord.create({
    data: {
      number: "lineage-claim-" + id,
      source: "BEFORE_SALE",
      status: "SENT_TO_COMPANY",
      faultReason: "Isolated schema fixture",
      oldUnitId: oldUnit.id,
      supplierId: supplier.id,
    },
  });
  const dispatch = await db.replacementDispatch.create({
    data: {
      number: "lineage-dispatch-" + id,
      supplier: { connect: { id: supplier.id } },
      dispatchDate: new Date("2026-11-01"),
      snapshot: {},
      posting: {
        create: {
          actorId: ownerId,
          kind: "TEST",
          sourceCode: "lineage-dispatch-post-" + id,
        },
      },
      items: {
        create: { replacementId: replacement.id, oldUnitId: oldUnit.id },
      },
    },
    include: { items: true },
  });
  const receipt = await db.replacementReceipt.create({
    data: {
      number: "lineage-receipt-" + id,
      supplier: { connect: { id: supplier.id } },
      receivedDate: new Date("2026-11-13"),
      posting: {
        create: {
          actorId: ownerId,
          kind: "TEST",
          sourceCode: "lineage-receipt-post-" + id,
        },
      },
    },
  });
  const itemId = randomUUID();
  await db.$transaction(async (tx) => {
    const batch = await tx.stockBatch.create({
      data: {
        productId: product.id,
        origin: "REPLACEMENT",
        originalQuantity: 1,
        unitCost: 12000,
        replacementReceiptItemId: itemId,
      },
    });
    const newUnit = await tx.batteryUnit.create({
      data: {
        productId: product.id,
        batchId: batch.id,
        origin: "REPLACEMENT",
        internalCode: "lineage-new-" + id,
        productionDate: new Date("2026-11-01"),
      },
    });
    await tx.replacementReceiptItem.create({
      data: {
        id: itemId,
        receiptId: receipt.id,
        replacementId: replacement.id,
        dispatchItemId: dispatch.items[0].id,
        oldUnitId: oldUnit.id,
        newUnitId: newUnit.id,
        inheritedUnitCost: 12000,
        policySnapshot: {},
      },
    });
    await tx.batteryUnit.update({
      where: { id: oldUnit.id },
      data: { commercialState: "RETIRED" },
    });
    await tx.replacementRecord.update({
      where: { id: replacement.id },
      data: { status: "REPLACEMENT_RECEIVED" },
    });
    await tx.dispatchItem.update({
      where: { id: dispatch.items[0].id },
      data: { returnedAt: new Date() },
    });
  });
  const lineage = await db.replacementReceiptItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { oldUnit: true, newUnit: { include: { batch: true } } },
  });
  assert.notEqual(lineage.newUnit.id, lineage.oldUnit.id);
  assert.equal(
    lineage.oldUnit.productionDate?.toISOString(),
    oldUnit.productionDate?.toISOString(),
  );
  assert.equal(lineage.newUnit.batch.replacementReceiptItemId, itemId);
  assert.equal(lineage.newUnit.commercialState, "UNAVAILABLE");
  assert.equal(lineage.newUnit.condition, "PENDING_INSPECTION");
});

test("only three permanent categories are offered and owners cannot create or delete them", async () => {
  const metadata = (await owner.get("/api/v1/catalog").expect(200)).body.data;
  assert.deepEqual(
    metadata.types.map((type: { name: string }) => type.name),
    ["Battery", "Parts & Accessories", "Easy Bike & Rickshaw"],
  );
  const count = await db.productType.count();
  await owner
    .post("/api/v1/product-types")
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(owner))
    .send({ name: "Custom category", trackingKind: "QUANTITY" })
    .expect(409);
  for (const type of metadata.types) {
    await owner
      .delete("/api/v1/product-types/" + type.id)
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .send({ confirmed: true })
      .expect(409);
    assert(await db.productType.findUnique({ where: { id: type.id } }));
  }
  assert.equal(await db.productType.count(), count);
  const vehicleType = metadata.types.find(
    (type: { name: string }) => type.name === "Easy Bike & Rickshaw",
  );
  const vehicle = await owner
    .post("/api/v1/products")
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(owner))
    .send({
      typeId: vehicleType.id,
      name: "Rickshaw " + id,
      category: "Rickshaw " + id,
      unit: "pcs",
      specifications: "Electric rickshaw",
    })
    .expect(201);
  assert.equal(vehicle.body.data.type.trackingKind, "QUANTITY");
  assert.equal(vehicle.body.data.type.id, vehicleType.id);
  assert.equal(vehicle.body.data.stock.total, "0");
  // Old types remain available to historical transactions but cannot receive new products/names.
  const legacy = await db.productType.create({
    data: { code: "legacy-" + id, name: "Legacy", trackingKind: "QUANTITY" },
  });
  for (const [route, body] of [
    ["categories", { typeId: legacy.id, name: "Blocked name" }],
    [
      "products",
      {
        typeId: legacy.id,
        name: "Blocked product",
        unit: "pcs",
        category: "Blocked name",
      },
    ],
  ] as const) {
    await owner
      .post("/api/v1/" + route)
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .send(body)
      .expect(400);
  }
});

test("purchase receiving posts exact stock, costs and supplier payment once; invalid purchases leave no partial records", async () => {
  const write = async (route: string, body: object) =>
    owner
      .post("/api/v1/" + route)
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .send(body)
      .expect(201);
  for (const [code, name, kind, paymentMethod] of [
    ["1300", "Inventory", "ASSET", null],
    ["2100", "Supplier payables", "LIABILITY", null],
    ["1100", "Cash", "ASSET", "CASH"],
  ] as const)
    await db.account.upsert({
      where: { code },
      update: { active: true },
      create: { code, name, kind, paymentMethod },
    });
  const cash = await db.account.findUniqueOrThrow({ where: { code: "1100" } });
  const supplier = await db.supplier.create({
    data: { name: "Receiving supplier " + id },
  });
  const quantityType = await db.productType.findUniqueOrThrow({
    where: { code: "PARTS" },
  });
  const unitType = await db.productType.findUniqueOrThrow({
    where: { code: "BATTERY" },
  });
  const emptyType = await db.productType.findUniqueOrThrow({
    where: { code: "EASY_BIKE_RICKSHAW" },
  });
  const inactiveType = await db.productType.create({
    data: {
      code: "purchase-inactive-" + id,
      name: "Purchase inactive " + id,
      trackingKind: "QUANTITY",
      active: false,
    },
  });
  const part = (
    await write("products", {
      typeId: quantityType.id,
      name: "Purchase nut " + id,
      unit: "piece",
      category: "Purchase fittings " + id,
    })
  ).body.data;
  const battery = (
    await write("products", {
      typeId: unitType.id,
      name: "Purchase unit " + id,
      unit: "piece",
      brand: "Purchase maker " + id,
      capacityAh: "100",
      voltage: "12",
      identificationMethod: "BOTH",
    })
  ).body.data;
  assert.equal(
    await db.stockBatch.count({
      where: { productId: { in: [part.id, battery.id] } },
    }),
    0,
  );
  await request(app.getHttpServer())
    .get("/api/v1/purchases/options")
    .expect(401);
  await staff.get("/api/v1/purchases/options").expect(403);
  const options = (await owner.get("/api/v1/purchases/options").expect(200))
    .body.data;
  const fixtureTypeIds = [unitType.id, emptyType.id, quantityType.id];
  assert.deepEqual(
    options.types.filter((type: { id: string }) =>
      fixtureTypeIds.includes(type.id),
    ),
    [unitType, emptyType, quantityType].map(({ id, name, trackingKind }) => ({
      id,
      name,
      trackingKind,
    })),
  );
  assert.equal(
    options.types.some((type: { id: string }) => type.id === inactiveType.id),
    false,
  );
  assert(
    options.products.some(
      (product: { id: string }) => product.id === battery.id,
    ),
  );
  assert(
    options.suppliers.some((item: { id: string }) => item.id === supplier.id),
  );
  const body = {
    supplierId: supplier.id,
    purchaseDate: "2025-06-01",
    reference: "Receipt " + id,
    items: [
      { productId: part.id, quantity: 3, unitPrice: "12.25" },
      {
        productId: battery.id,
        quantity: 2,
        unitPrice: "1000.10",
        identities: [
          { serialNumber: "SERIAL-A-" + id, productionDate: "2025-05-01" },
          { serialNumber: "SERIAL-B-" + id, productionDate: "2025-05-01" },
        ],
      },
    ],
    paidAmount: "500.05",
    paymentAccountId: cash.id,
  };
  const receive = async (payload: object, key = randomUUID()) =>
    owner
      .post("/api/v1/purchases/receive")
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .set("Idempotency-Key", key)
      .send(payload);
  await request(app.getHttpServer())
    .post("/api/v1/purchases/receive")
    .set("Origin", origin())
    .send(body)
    .expect(401);
  await staff
    .post("/api/v1/purchases/receive")
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(staff))
    .set("Idempotency-Key", randomUUID())
    .send(body)
    .expect(403);
  await owner
    .post("/api/v1/purchases/receive")
    .set("Origin", origin())
    .set("Idempotency-Key", randomUUID())
    .send(body)
    .expect(403);
  await owner
    .post("/api/v1/purchases/receive")
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(owner))
    .send(body)
    .expect(400);
  const before = await db.purchase.count();
  for (const invalid of [
    { ...body, discount: "1" },
    { ...body, purchaseDate: "2025-02-31" },
    { ...body, supplierId: randomUUID() },
    { ...body, paidAmount: "999999.00" },
    { ...body, items: [{ ...body.items[0], quantity: 0 }] },
    { ...body, items: [{ ...body.items[0], unitPrice: "100000000000000.00" }] },
    {
      ...body,
      items: [
        {
          ...body.items[1],
          identities: [{ serialNumber: "Missing-date" + id }],
        },
      ],
    },
    {
      ...body,
      items: [
        {
          ...body.items[1],
          identities: [
            { serialNumber: "DUPLICATE-" + id, productionDate: "2025-05-01" },
            {
              serialNumber: " duplicate-" + id.toUpperCase() + " ",
              productionDate: "2025-05-01",
            },
          ],
        },
      ],
    },
  ]) {
    const response = await receive(invalid);
    assert([400, 409].includes(response.status), JSON.stringify(response.body));
  }
  assert.equal(await db.purchase.count(), before);
  const key = randomUUID();
  const concurrent = await Promise.all([
    receive(body, key),
    receive(body, key),
  ]);
  for (const response of concurrent)
    assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.deepEqual(concurrent[0].body, concurrent[1].body);
  assert(
    concurrent.some(
      (response) => response.headers["idempotency-replayed"] === "true",
    ),
  );
  const result = concurrent[0].body.data;
  assert.equal(result.total, "2036.95");
  assert.equal(result.paid, "500.05");
  assert.equal(result.due, "1536.90");
  assert.equal(result.quantity, 5);
  assert.equal(await db.purchase.count(), before + 1);
  const receipt = await db.purchaseReceipt.findUniqueOrThrow({
    where: { id: result.receiptId },
    include: {
      items: {
        include: { batch: { include: { balances: true, batteryUnits: true } } },
      },
      posting: {
        include: {
          movements: true,
          journal: { include: { lines: { include: { account: true } } } },
        },
      },
      paymentAllocations: {
        include: {
          payment: { include: { journal: { include: { lines: true } } } },
        },
      },
    },
  });
  assert.equal(receipt.items.length, 2);
  const partBatch = receipt.items.find(
    (item) => item.batch?.productId === part.id,
  )!.batch!;
  const unitBatch = receipt.items.find(
    (item) => item.batch?.productId === battery.id,
  )!.batch!;
  assert.equal(partBatch.unitCost.toFixed(2), "12.25");
  assert.equal(partBatch.balances[0].quantity.toString(), "3");
  assert.equal(unitBatch.unitCost.toFixed(2), "1000.10");
  assert.equal(unitBatch.batteryUnits.length, 2);
  assert(
    unitBatch.batteryUnits.every(
      (unit) =>
        unit.condition === "GOOD" &&
        unit.commercialState === "AVAILABLE" &&
        unit.custody === "SHOP",
    ),
  );
  assert.notEqual(
    unitBatch.batteryUnits[0].internalCode,
    unitBatch.batteryUnits[1].internalCode,
  );
  assert.equal(receipt.posting.movements.length, 3);
  const inventoryLine = receipt.posting.journal!.lines.find(
    (line) => line.account.code === "1300",
  )!;
  const payableLine = receipt.posting.journal!.lines.find(
    (line) => line.account.code === "2100",
  )!;
  assert.equal(inventoryLine.debit.toFixed(2), "2036.95");
  assert.equal(payableLine.credit.toFixed(2), "2036.95");
  assert.equal(payableLine.supplierId, supplier.id);
  assert.equal(receipt.paymentAllocations[0].amount.toFixed(2), "500.05");
  assert.equal(receipt.paymentAllocations[0].payment.assetAccountId, cash.id);
  assert.equal(receipt.paymentAllocations[0].payment.journal.lines.length, 2);
  assert(
    await db.auditLog.findFirst({
      where: { action: "PURCHASE_RECEIVE", resourceId: result.id },
    }),
  );
  const stock = (
    await owner.get("/api/v1/products?typeId=" + quantityType.id).expect(200)
  ).body.data.items[0].stock;
  assert.equal(stock.total, "3");
  assert.equal(stock.available, "3");
  const unitStock = (
    await owner.get("/api/v1/products?typeId=" + unitType.id).expect(200)
  ).body.data.items[0].stock;
  assert.equal(Number(unitStock.total), 2);
  assert.equal(Number(unitStock.available), 2);
  const listing = (
    await owner.get("/api/v1/purchases?pageSize=100").expect(200)
  ).body.data;
  assert.equal(
    listing.items.find((item: { id: string }) => item.id === result.id).due,
    "1536.90",
  );
  assert.equal(
    (await receive({ ...body, paidAmount: "500.00" }, key)).status,
    409,
  );
  // A database serial uniqueness error after the parts line was inserted rolls back the entire purchase.
  const duplicate = await receive({
    ...body,
    items: [
      body.items[0],
      {
        ...body.items[1],
        quantity: 1,
        identities: [body.items[1].identities![0]],
      },
    ],
  });
  assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
  assert.equal(await db.purchase.count(), before + 1);
  assert.equal(await db.stockBatch.count({ where: { productId: part.id } }), 1);
  assert.equal(
    await db.batteryUnit.count({ where: { productId: battery.id } }),
    2,
  );
});

test("receiving without finance permission accepts due stock and repeated production dates but rejects payments", async () => {
  const type = await db.productType.findFirstOrThrow({
    where: { code: "BATTERY" },
  });
  const supplier = await db.supplier.findFirstOrThrow({
    where: { name: "Receiving supplier " + id },
  });
  const response = await owner
    .post("/api/v1/products")
    .set("Origin", origin())
    .set("X-CSRF-Token", await csrf(owner))
    .send({
      typeId: type.id,
      name: "Date units " + id,
      unit: "piece",
      brand: "Purchase maker " + id,
      capacityAh: "80",
      voltage: "12",
      identificationMethod: "PRODUCTION_DATE",
    })
    .expect(201);
  const productId = response.body.data.id;
  const codes = ["purchases.manage", "inventory.receive"];
  const role = await db.role.create({
    data: {
      code: "receiving-test-" + id,
      name: "Isolated receiver",
      permissions: {
        create: codes.map((code) => ({ permission: { connect: { code } } })),
      },
    },
  });
  const loginName = "receiver-test-" + id;
  await db.user.create({
    data: {
      login: loginName,
      name: "Isolated receiver",
      passwordHash: await hash(password, passwordOptions),
      roles: { create: { roleId: role.id } },
    },
  });
  const receiver = request.agent(app.getHttpServer());
  assert.equal((await login(receiver, loginName)).status, 201);
  const body = {
    supplierId: supplier.id,
    purchaseDate: "2025-06-01",
    items: [
      {
        productId,
        quantity: 2,
        unitPrice: "0.00",
        identities: [
          { productionDate: "2025-05-01" },
          { productionDate: "2025-05-01" },
        ],
      },
    ],
  };
  const send = async (payload: object) =>
    receiver
      .post("/api/v1/purchases/receive")
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(receiver))
      .set("Idempotency-Key", randomUUID())
      .send(payload);
  assert.equal((await send({ ...body, paidAmount: "1.00" })).status, 403);
  const received = await send(body);
  assert.equal(received.status, 201, JSON.stringify(received.body));
  assert.equal(received.body.data.total, "0.00");
  assert.equal(received.body.data.due, "0.00");
  const units = await db.batteryUnit.findMany({ where: { productId } });
  assert.equal(units.length, 2);
  assert.equal(
    units[0].productionDate?.toISOString(),
    units[1].productionDate?.toISOString(),
  );
  assert.notEqual(units[0].internalCode, units[1].internalCode);
  const receipt = await db.purchaseReceipt.findUniqueOrThrow({
    where: { id: received.body.data.receiptId },
    include: { posting: { include: { journal: true } } },
  });
  assert.equal(receipt.posting.journal, null);
});

test("customers are shared persisted contacts with vehicles, validation, audit and access checks", async () => {
  const body = {
    name: "Shared customer " + id,
    phone: "+8801712345678",
    address: "Dhaka",
    vehicleType: "Easy Bike",
    vehicleIdentifier: "VEH-" + id,
  };
  await request(app.getHttpServer()).get("/api/v1/customers").expect(401);
  await staff
    .post("/api/v1/customers")
    .set("Origin", origin())
    .send(body)
    .expect(403);
  const write = async (payload: object) =>
    staff
      .post("/api/v1/customers")
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(staff))
      .send(payload);
  assert.equal((await write({ ...body, phone: "bad" })).status, 400);
  assert.equal((await write({ ...body, active: false })).status, 400);
  assert.equal((await write({ ...body, vehicleType: "" })).status, 400);
  const created = await write(body);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const customer = created.body.data;
  assert.equal(customer.totalSales, "0.00");
  assert.equal(customer.due, "0.00");
  assert.equal(customer.vehicles[0].identifier, body.vehicleIdentifier);
  const stored = await db.customer.findUniqueOrThrow({
    where: { id: customer.id },
    include: { vehicles: true },
  });
  assert.equal(stored.name, body.name);
  assert.equal(stored.vehicles[0].type, body.vehicleType);
  assert.equal(
    await db.auditLog.count({
      where: {
        action: "CUSTOMER_CREATED",
        resourceId: customer.id,
        actorId: staffId,
      },
    }),
    1,
  );
  const listed = await owner
    .get("/api/v1/customers")
    .query({ q: body.vehicleIdentifier, status: "active", credit: "clear" })
    .expect(200);
  assert.deepEqual(
    listed.body.data.items.map((item: { id: string }) => item.id),
    [customer.id],
  );
  assert.equal(listed.body.data.summary.total >= 1, true);
  await owner.get("/api/v1/customers").query({ pageSize: 101 }).expect(400);
});

test("sales atomically consume FIFO stock, preserve warranty, post exact payments and customer dues, and replay once", async () => {
  for (const [code, name, kind, paymentMethod] of [
    ["1200", "Customer receivables", "ASSET", null],
    ["1300", "Inventory", "ASSET", null],
    ["2100", "Supplier payable", "LIABILITY", null],
    ["4100", "Sales revenue", "REVENUE", null],
    ["5100", "Cost of goods sold", "EXPENSE", null],
    ["1100", "Cash", "ASSET", "CASH"],
  ] as const)
    await db.account.upsert({
      where: { code },
      update: { active: true },
      create: { code, name, kind, paymentMethod },
    });
  const cash = await db.account.findUniqueOrThrow({ where: { code: "1100" } });
  const write = async (route: string, body: object) =>
    owner
      .post("/api/v1/" + route)
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .send(body)
      .expect(201);
  const customer = (
    await write("customers", {
      name: "Sale customer " + id,
      phone: "01700000000",
    })
  ).body.data;
  const quantityType = await db.productType.findUniqueOrThrow({
    where: { code: "PARTS" },
  });
  const unitType = await db.productType.findUniqueOrThrow({
    where: { code: "BATTERY" },
  });
  const emptyType = await db.productType.findUniqueOrThrow({
    where: { code: "EASY_BIKE_RICKSHAW" },
  });
  const part = (
    await write("products", {
      typeId: quantityType.id,
      name: "Sale nut " + id,
      unit: "piece",
      category: "Sale fittings " + id,
      defaultSellingPrice: "20.25",
    })
  ).body.data;
  const battery = (
    await write("products", {
      typeId: unitType.id,
      name: "Sale battery " + id,
      unit: "piece",
      brand: "Sale maker " + id,
      capacityAh: "100",
      voltage: "12",
      identificationMethod: "BOTH",
      warrantyMonths: 1,
      defaultSellingPrice: "150.10",
    })
  ).body.data;
  const supplier = await db.supplier.create({
    data: { name: "Sale fixture supplier " + id },
  });
  const receive = async (purchaseDate: string, items: object[]) =>
    owner
      .post("/api/v1/purchases/receive")
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(owner))
      .set("Idempotency-Key", randomUUID())
      .send({ supplierId: supplier.id, purchaseDate, items })
      .expect(201);
  await receive("2025-01-01", [
    { productId: part.id, quantity: 2, unitPrice: "10.10" },
    {
      productId: battery.id,
      quantity: 2,
      unitPrice: "100.20",
      identities: [
        { serialNumber: "SALE-A-" + id, productionDate: "2024-12-01" },
        { serialNumber: "SALE-B-" + id, productionDate: "2024-12-01" },
      ],
    },
  ]);
  await receive("2025-01-02", [
    { productId: part.id, quantity: 3, unitPrice: "12.25" },
  ]);
  const units = await db.batteryUnit.findMany({
    where: { productId: battery.id },
    orderBy: { serialNumber: "asc" },
  });
  await request(app.getHttpServer()).get("/api/v1/sales/options").expect(401);
  const before = await staff.get("/api/v1/sales/options").expect(200);
  assert(
    before.body.data.types.some(
      (type: { id: string }) => type.id === emptyType.id,
    ),
  );
  assert.equal(
    before.body.data.products.find(
      (product: { id: string }) => product.id === part.id,
    ).availableQuantity,
    "5",
  );
  assert.equal(
    before.body.data.products.find(
      (product: { id: string }) => product.id === battery.id,
    ).availableQuantity,
    "2",
  );
  assert(
    before.body.data.customers.some(
      (item: { id: string }) => item.id === customer.id,
    ),
  );
  const body = {
    customerId: customer.id,
    saleDate: "2025-01-31",
    notes: "Shared sale",
    items: [
      { productId: part.id, quantity: 3, unitPrice: "20.25" },
      {
        productId: battery.id,
        quantity: 1,
        unitPrice: "150.10",
        batteryUnitIds: [units[0].id],
      },
    ],
    paidAmount: "100.05",
    paymentAccountId: cash.id,
  };
  const complete = async (payload: object, key = randomUUID(), agent = staff) =>
    agent
      .post("/api/v1/sales/complete")
      .set("Origin", origin())
      .set("X-CSRF-Token", await csrf(agent))
      .set("Idempotency-Key", key)
      .send(payload);
  await staff
    .post("/api/v1/sales/complete")
    .set("Origin", origin())
    .send(body)
    .expect(403);
  const key = randomUUID();
  const first = await complete(body, key);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.data.total, "210.85");
  assert.equal(first.body.data.paid, "100.05");
  assert.equal(first.body.data.due, "110.80");
  assert.equal(first.body.data.quantity, 4);
  const replay = await complete(body, key);
  assert.equal(replay.status, 201, JSON.stringify(replay.body));
  assert.deepEqual(replay.body, first.body);
  assert.equal(replay.headers["idempotency-replayed"], "true");
  assert.equal(
    (await complete({ ...body, notes: "Changed" }, key)).status,
    409,
  );
  const sale = await db.sale.findUniqueOrThrow({
    where: { id: key },
    include: {
      items: { include: { costAllocations: true, units: true } },
      posting: {
        include: {
          journal: { include: { lines: { include: { account: true } } } },
        },
      },
      paymentAllocations: { include: { payment: true } },
    },
  });
  const partLine = sale.items.find((item) => item.productId === part.id)!;
  assert.equal(partLine.costAllocations.length, 2);
  assert.equal(partLine.costTotal.toFixed(2), "32.45");
  const batteryLine = sale.items.find((item) => item.productId === battery.id)!;
  assert.equal(batteryLine.costTotal.toFixed(2), "100.20");
  assert.equal(
    batteryLine.units[0].coverageStart.toISOString().slice(0, 10),
    "2025-01-31",
  );
  assert.equal(
    batteryLine.units[0].coverageExpiry.toISOString().slice(0, 10),
    "2025-02-28",
  );
  const sold = await db.batteryUnit.findUniqueOrThrow({
    where: { id: units[0].id },
  });
  assert.deepEqual(
    [sold.custody, sold.ownership, sold.commercialState],
    ["CUSTOMER", "CUSTOMER", "SOLD"],
  );
  const journal = sale.posting!.journal!.lines;
  const amount = (code: string, side: "debit" | "credit") =>
    journal
      .filter((line) => line.account.code === code)
      .reduce((sum, line) => sum + Number(line[side]), 0)
      .toFixed(2);
  assert.equal(amount("1200", "debit"), "210.85");
  assert.equal(amount("4100", "credit"), "210.85");
  assert.equal(amount("5100", "debit"), "132.65");
  assert.equal(amount("1300", "credit"), "132.65");
  assert.equal(sale.paymentAllocations[0].payment.amount.toFixed(2), "100.05");
  assert.equal(
    await db.stockMovement.count({ where: { postingId: sale.postingId! } }),
    3,
  );
  assert.equal(
    await db.auditLog.count({
      where: { resourceId: key, action: "SALE_COMPLETE" },
    }),
    1,
  );
  const contacts = (
    await owner
      .get("/api/v1/customers")
      .query({ q: customer.name, credit: "due" })
      .expect(200)
  ).body.data;
  assert.equal(contacts.items[0].due, "110.80");
  assert.equal(contacts.items[0].totalSales, "210.85");
  const listed = (
    await staff
      .get("/api/v1/sales")
      .query({ q: first.body.data.invoiceNumber, status: "due" })
      .expect(200)
  ).body.data;
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].due, "110.80");
  assert.equal(listed.items[0].quantity, "4");
  const stock = () =>
    db.inventoryBalance.aggregate({
      where: { batch: { productId: part.id } },
      _sum: { quantity: true },
    });
  assert.equal((await stock())._sum.quantity?.toString(), "2");
  const saleCount = await db.sale.count();
  const invalid = await complete({
    ...body,
    items: [
      { productId: part.id, quantity: 1, unitPrice: "20.25" },
      {
        productId: battery.id,
        quantity: 1,
        unitPrice: "150.10",
        batteryUnitIds: [units[0].id],
      },
    ],
    paidAmount: "0.00",
  });
  assert.equal(invalid.status, 409, JSON.stringify(invalid.body));
  assert.equal(await db.sale.count(), saleCount);
  assert.equal((await stock())._sum.quantity?.toString(), "2");
  assert.equal((await complete({ ...body, paidAmount: "999.00" })).status, 400);
  assert.equal(
    (await complete({ ...body, saleDate: "2025-02-30" })).status,
    400,
  );
  assert.equal(
    (
      await complete({
        ...body,
        items: [{ productId: part.id, quantity: 1, unitPrice: "0.001" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await complete({ ...body, items: [body.items[0], body.items[0]] })).status,
    400,
  );
  // Competing requests cannot consume the same last quantity or battery twice.
  const lastParts = {
    customerId: customer.id,
    saleDate: "2025-01-31",
    items: [{ productId: part.id, quantity: 2, unitPrice: "20.25" }],
    paidAmount: "0.00",
  };
  const races = await Promise.all([complete(lastParts), complete(lastParts)]);
  assert.deepEqual(races.map((response) => response.status).sort(), [201, 409]);
  assert.equal((await stock())._sum.quantity?.toString(), "0");
  const lastBattery = {
    customerId: customer.id,
    saleDate: "2025-01-31",
    items: [{ productId: battery.id, quantity: 1, unitPrice: "150.10" }],
    paidAmount: "0.00",
  };
  const batteryRaces = await Promise.all([
    complete(lastBattery),
    complete(lastBattery),
  ]);
  assert.deepEqual(
    batteryRaces.map((response) => response.status).sort(),
    [201, 409],
  );
  assert.equal(
    await db.saleUnit.count({
      where: { batteryUnitId: units[1].id, releasedAt: null },
    }),
    1,
  );
});
