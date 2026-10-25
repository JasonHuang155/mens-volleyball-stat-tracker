-- Runs once, the first time the local Postgres container starts.
-- Tests use their own database so they never touch the data you're developing with.
CREATE DATABASE volleyball_test;
