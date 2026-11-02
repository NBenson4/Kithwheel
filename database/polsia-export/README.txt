Your database export
====================

Taken from PostgreSQL 16.15 (df8277c) at 2026-11-02 01:35:18.149836+00.
Schema "public" — 10 table(s), 0 row(s).

This is a point-in-time copy, not a live connection and not a backup service.
Anything written to your app after the timestamp above is not in here.

Files
-----
  01-schema.sql   tables, types, sequences, constraints, indexes and views
  02-data.sql     your rows, then the foreign keys, then sequence positions

How to restore
--------------
Into any empty PostgreSQL 13 or newer database, in this order:

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 01-schema.sql
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 02-data.sql

The order matters. 01-schema.sql on its own gives you a schema with no
foreign keys — they are the last thing 02-data.sql adds, which is what lets
the rows load without worrying about which table depends on which.

Both files target whatever schema the `SET search_path` line near the top names.
Change that one line in both files to restore somewhere else.

Also not included: database roles and their passwords, table ownership and
privileges (everything belongs to whoever runs the restore), and scheduled jobs.
