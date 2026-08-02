# Database Setup Instructions

## PostgreSQL Setup Complete

PostgreSQL 16 with pgvector extension has been successfully installed and configured.

## Required Environment Variables

Update your `.env` file with the following:

```env
DATABASE_URL="postgresql://atlas_user:atlas_password@localhost:5432/atlas_dev?schema=public"
```

## Database Connection Details

- **Host:** localhost
- **Port:** 5432
- **Database:** atlas_dev
- **User:** atlas_user
- **Password:** atlas_password
- **Schema:** public

## Next Steps

1. Update your `.env` file with the DATABASE_URL above
2. Run `npx prisma db push` to create the database schema
3. Run `node scripts/migrate-to-postgres.mjs` to migrate existing data (if any)
4. Run `npm run dev` to start the application

## pgvector Extension

The pgvector extension has been installed and enabled in the atlas_dev database. This will be used for semantic search in the memory system.

## Testing the Connection

Test the database connection:

```bash
/opt/homebrew/opt/postgresql@16/bin/psql -U atlas_user -d atlas_dev -c "SELECT version();"
```

## Backup SQLite Database

Before proceeding, backup your existing SQLite database:

```bash
cp dev.db dev.db.backup
```

## Troubleshooting

If you encounter connection issues:

1. Ensure PostgreSQL is running: `brew services list`
2. Check PostgreSQL logs: `tail -f /opt/homebrew/var/log/postgresql@16.log`
3. Verify user permissions: `\du` in psql
4. Test connection manually: `psql -U atlas_user -d atlas_dev`
