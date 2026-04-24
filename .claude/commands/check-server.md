# check-server

Check the health of the vi_power server and MongoDB connection.

## Steps

1. Check if MongoDB is reachable at `mongodb://localhost:27017`
2. Check if Node process is running on port 3000
3. List all collections in the `vi_power` database and their document counts
4. Show the most recent energy_data record timestamp for any device
5. Report overall status: OK / DEGRADED / DOWN
