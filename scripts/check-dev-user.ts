import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: 'file:/Users/vishnuvardhan/Desktop/image-feed/dev.db' });
const prisma = new PrismaClient({ adapter });

(async () => {
  const user = await prisma.user.findUnique({ 
    where: { email: 'dev@atlas.local' }, 
    include: { accounts: true } 
  });
  console.log(JSON.stringify(user, null, 2));
  await prisma.$disconnect();
})();
