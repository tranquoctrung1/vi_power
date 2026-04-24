# init-db

Reinitialize the MongoDB database for vi_power project.

## Steps

1. Navigate to `server/` directory
2. Check if `.env` file exists — if not, create it with default values:
   ```
   MONGODB_URI=mongodb://localhost:27017/vi_power
   DATABASE_NAME=vi_power
   JWT_SECRET=bavitech_vi_power_2026
   PORT=3000
   NODE_ENV=development
   ```
3. Run: `node init-db.js` from the `server/` directory
4. Report the result — show collections created and record counts

## Notes
- `NODE_ENV=development` causes the script to DROP the existing database first
- Default admin login after init: `admin / admin`
- 9 devices created, each with ~10,000 energy_data records
