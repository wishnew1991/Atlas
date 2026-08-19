import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.integration.upsert({
    where: { id: "swiggy" },
    update: {
      transport: "browser",
      transportOrderJson: JSON.stringify(["api", "mcp", "browser"]),
    },
    create: {
      id: "swiggy",
      name: "Swiggy",
      transport: "browser",
      transportOrderJson: JSON.stringify(["api", "mcp", "browser"]),
    },
  });

  await prisma.integration.upsert({
    where: { id: "zomato" },
    update: { transport: "browser", transportOrderJson: JSON.stringify(["browser"]) },
    create: { id: "zomato", name: "Zomato", transport: "browser", transportOrderJson: JSON.stringify(["browser"]) },
  });

  await prisma.integration.upsert({
    where: { id: "bookmyshow" },
    update: { transport: "browser", transportOrderJson: JSON.stringify(["browser"]) },
    create: { id: "bookmyshow", name: "BookMyShow", transport: "browser", transportOrderJson: JSON.stringify(["browser"]) },
  });

  await prisma.integration.upsert({
    where: { id: "makemytrip" },
    update: { transport: "browser", transportOrderJson: JSON.stringify(["browser"]) },
    create: { id: "makemytrip", name: "MakeMyTrip", transport: "browser", transportOrderJson: JSON.stringify(["browser"]) },
  });

  console.log("Database seeded with browser integrations.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
