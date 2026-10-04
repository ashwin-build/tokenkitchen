import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformPrisma, systemTenantDatabase, tenantDatabase } from "@/server/db/prisma";
import { processSimulatedSubscriptionPayment } from "@/server/system/subscription-payment-event";
import { en } from "@/i18n/en";
import { archiveDishForMembership, archiveIngredientForMembership, saveDishForMembership, saveIngredientForMembership } from "@/server/catalog/services";
import { confirmCatalogImport, previewCatalogImport } from "@/server/catalog/imports";

describe("central tenant scoping", () => {
  let tenantAId: string;
  let tenantBId: string;
  let tenantASubscriptionId: string;
  let ingredientBId: string;
  let dishBId: string;
  let tenantBIngredientName: string;

  beforeAll(async () => {
    const suffix = crypto.randomUUID();
    const [tenantA, tenantB] = await Promise.all([
      platformPrisma.tenant.create({
        data: { name: "Tenant A", slug: `tenant-a-${suffix}` },
      }),
      platformPrisma.tenant.create({
        data: { name: "Tenant B", slug: `tenant-b-${suffix}` },
      }),
    ]);

    tenantAId = tenantA.id;
    tenantBId = tenantB.id;
    tenantBIngredientName = `B ingredient ${suffix}`;

    const [subscriptionA] = await Promise.all([
      platformPrisma.subscription.create({
        data: {
          tenantId: tenantAId,
          status: "TRIALING",
          trialStartedAt: new Date(),
          trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }),
      platformPrisma.subscription.create({
        data: {
          tenantId: tenantBId,
          status: "TRIALING",
          trialStartedAt: new Date(),
          trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }),
    ]);
    tenantASubscriptionId = subscriptionA.id;

    const ingredient = await saveIngredientForMembership({ tenantId: tenantBId, role: "OWNER" }, {
      id: "",
      name: tenantBIngredientName,
      unit: "kg",
      openingQuantity: "2.5",
      reorderLevel: "1",
      costPerUnitPaise: "12000",
    });
    ingredientBId = ingredient.id;

    const dish = await saveDishForMembership({ tenantId: tenantBId, role: "OWNER" }, {
      id: "",
      name: `Dish B ${suffix}`,
      priceRupees: "85.00",
      gstRate: "5",
      isActive: "true",
      recipeLines: JSON.stringify([{ ingredientId: ingredientBId, quantityPerDish: "0.25" }]),
    });
    dishBId = dish.id;
  });

  afterAll(async () => {
    if (tenantAId && tenantBId) {
      await platformPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    }
    await platformPrisma.$disconnect();
  });

  it("blocks cross-tenant reads and writes and overrides spoofed create tenant IDs", async () => {
    expect(await tenantDatabase(tenantAId).tenant.findUnique({ where: { id: tenantBId } })).toBeNull();
    await expect(tenantDatabase(tenantAId).tenant.updateMany({ where: { id: tenantBId }, data: { name: "Changed" } }))
      .rejects.toThrow(en.errors.systemWriteDenied);

    const hiddenIngredient = await tenantDatabase(tenantAId).ingredient.findUnique({ where: { id: ingredientBId } });
    expect(hiddenIngredient).toBeNull();

    const updateResult = await tenantDatabase(tenantAId).ingredient.updateMany({
      where: { id: ingredientBId },
      data: { name: "Changed by tenant A" },
    });
    expect(updateResult.count).toBe(0);

    const spoofedCreate = await tenantDatabase(tenantAId).ingredient.create({
      data: { tenantId: tenantBId, name: "A-owned ingredient", unit: "KG" },
    });
    expect(spoofedCreate.tenantId).toBe(tenantAId);

    const unchangedIngredient = await tenantDatabase(tenantBId).ingredient.findUnique({ where: { id: ingredientBId } });
    expect(unchangedIngredient?.name).toBe(tenantBIngredientName);
    expect(unchangedIngredient?.currentStock.toString()).toBe("2.5");

    expect(await tenantDatabase(tenantAId).dish.findUnique({ where: { id: dishBId } })).toBeNull();
    expect(await tenantDatabase(tenantAId).recipeLine.count({ where: { dishId: dishBId } })).toBe(0);
    expect(await tenantDatabase(tenantAId).stockMovement.count({ where: { ingredientId: ingredientBId } })).toBe(0);
    const openingMovements = await tenantDatabase(tenantBId).stockMovement.findMany({ where: { ingredientId: ingredientBId } });
    expect(openingMovements).toHaveLength(1);
    expect(openingMovements[0]?.type).toBe("OPENING");

    await expect(tenantDatabase(tenantBId).ingredient.create({
      data: { tenantId: tenantBId, name: tenantBIngredientName.toLowerCase(), unit: "KG" },
    })).rejects.toThrow();
    await expect(tenantDatabase(tenantBId).ingredient.create({
      data: { tenantId: tenantBId, name: "Bypassed opening movement", unit: "KG", currentStock: "1" },
    })).rejects.toThrow("Opening stock must be recorded by inserting a stock movement");
    await expect(tenantDatabase(tenantAId).dish.create({
      data: { tenantId: tenantAId, name: "Invalid GST rate", pricePaise: 100, gstRate: 7 },
    })).rejects.toThrow();

    await expect(tenantDatabase(tenantBId).ingredient.update({
      where: { id: ingredientBId },
      data: { currentStock: "50" },
    })).rejects.toThrow("Ingredient stock can only be changed by inserting a stock movement");
    await expect(tenantDatabase(tenantBId).stockMovement.update({
      where: { id: openingMovements[0]!.id },
      data: { notes: "tampered" },
    })).rejects.toThrow("Stock movements are immutable");
    await expect(tenantDatabase(tenantBId).stockMovement.delete({
      where: { id: openingMovements[0]!.id },
    })).rejects.toThrow("Stock movements are immutable");
  });

  it("allows reads but blocks writes after the latest subscription ends", async () => {
    await platformPrisma.subscription.updateMany({
      where: { tenantId: tenantAId },
      data: { trialEndsAt: new Date(Date.now() - 1000) },
    });

    await expect(tenantDatabase(tenantAId).ingredient.create({
      data: { tenantId: tenantAId, name: "Blocked write", unit: "KG" },
    })).rejects.toThrow("This business plan has ended");

    expect(await tenantDatabase(tenantAId).ingredient.count()).toBe(1);
    await expect(systemTenantDatabase(tenantAId).ingredient.create({
      data: { tenantId: tenantAId, name: "System bypass blocked", unit: "KG" },
    })).rejects.toThrow(en.errors.systemWriteDenied);

    await systemTenantDatabase(tenantAId).webhookEvent.create({
      data: {
        tenantId: tenantAId,
        provider: "RAZORPAY",
        idempotencyKey: `system-event-${crypto.randomUUID()}`,
        rawBody: Buffer.from("{}"),
      },
    });

    await expect(tenantDatabase(tenantAId).subscription.updateMany({
      where: { id: tenantASubscriptionId },
      data: { status: "ACTIVE" },
    })).rejects.toThrow(en.errors.systemWriteDenied);
    await expect(tenantDatabase(tenantAId).webhookEvent.create({
      data: {
        tenantId: tenantAId,
        provider: "RAZORPAY",
        idempotencyKey: "user-client-event",
        rawBody: Buffer.from("{}"),
      },
    })).rejects.toThrow(en.errors.systemWriteDenied);

    const paymentEvent = {
      tenantId: tenantAId,
      subscriptionId: tenantASubscriptionId,
      eventId: `payment-${crypto.randomUUID()}`,
      providerSubscriptionId: `provider-sub-${crypto.randomUUID()}`,
      currentPeriodStartedAt: new Date(),
      currentPeriodEndsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      rawBody: Buffer.from('{"simulated":"payment-confirmed"}'),
    };
    await expect(processSimulatedSubscriptionPayment(paymentEvent)).resolves.toEqual({ processed: true, replayed: false });
    await expect(processSimulatedSubscriptionPayment(paymentEvent)).resolves.toEqual({ processed: false, replayed: true });

    const activeSubscription = await platformPrisma.subscription.findUnique({
      where: { id: tenantASubscriptionId },
      select: { status: true },
    });
    expect(activeSubscription?.status).toBe("ACTIVE");
  });

  it("enforces editor roles on catalog mutation services", async () => {
    const before = await tenantDatabase(tenantBId).ingredient.count();
    await expect(saveIngredientForMembership({ tenantId: tenantBId, role: "CASHIER" }, {
      id: "",
      name: "Cashier attempt",
      unit: "kg",
      openingQuantity: "1",
      reorderLevel: "",
      costPerUnitPaise: "100",
    })).rejects.toThrow("Only an owner or manager can change ingredients and dishes");
    expect(await tenantDatabase(tenantBId).ingredient.count()).toBe(before);
  });

  it("enforces case-insensitive names and archives only after active recipes are removed", async () => {
    await expect(saveIngredientForMembership({ tenantId: tenantBId, role: "OWNER" }, {
      id: "",
      name: tenantBIngredientName.toLocaleLowerCase("en-IN"),
      unit: "kg",
      openingQuantity: "0",
      reorderLevel: "",
      costPerUnitPaise: "12000",
    })).rejects.toThrow("An ingredient with that name already exists");

    const unknownRecipePreview = await previewCatalogImport({ tenantId: tenantBId, role: "MANAGER" }, "dishes", [
      "name,pricePaise,gstRate,active,recipe",
      "Unknown component,1000,5,true,Not in catalog:1",
    ].join("\n"));
    expect(unknownRecipePreview.rows[0]?.action).toBe("skip");
    expect(unknownRecipePreview.rows[0]?.errors).toContain("Unknown or archived ingredient: Not in catalog.");

    await expect(archiveIngredientForMembership({ tenantId: tenantBId, role: "MANAGER" }, ingredientBId))
      .rejects.toThrow("Remove this ingredient from active recipes before archiving it");

    await archiveDishForMembership({ tenantId: tenantBId, role: "OWNER" }, dishBId);
    await archiveIngredientForMembership({ tenantId: tenantBId, role: "OWNER" }, ingredientBId);

    expect(await tenantDatabase(tenantBId).recipeLine.count({ where: { dishId: dishBId } })).toBe(1);
    expect((await tenantDatabase(tenantBId).ingredient.findUnique({ where: { id: ingredientBId } }))?.isActive).toBe(false);
  });

  it("rolls back all prior CSV rows if a later database write fails", async () => {
    const constraintName = `test_import_failure_${crypto.randomUUID().replaceAll("-", "")}`;
    await platformPrisma.$executeRawUnsafe(
      `ALTER TABLE "Ingredient" ADD CONSTRAINT "${constraintName}" CHECK ("name" <> 'Force import failure')`,
    );
    try {
      const csv = [
        "name,unit,currentQuantity,reorderLevel,costPerUnitPaise,active",
        "Rollback first row,kg,1,,100,true",
        "Force import failure,kg,1,,100,true",
      ].join("\n");

      await expect(confirmCatalogImport({ tenantId: tenantAId, role: "OWNER" }, "ingredients", csv)).rejects.toThrow();
      expect(await tenantDatabase(tenantAId).ingredient.count({ where: { name: "Rollback first row" } })).toBe(0);
      expect(await tenantDatabase(tenantAId).stockMovement.count({
        where: { ingredient: { name: "Rollback first row" } },
      })).toBe(0);
    } finally {
      await platformPrisma.$executeRawUnsafe(`ALTER TABLE "Ingredient" DROP CONSTRAINT "${constraintName}"`);
    }
  });
});