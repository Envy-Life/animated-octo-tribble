import { sql } from 'drizzle-orm';
import * as schema from './schema';

import { drizzle } from 'drizzle-orm/node-postgres';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { db } from '..';

// Seed function
async function seedDB() {
    console.log('🌱 Starting database seeding...');
    
    try {
      // Seed chains
      console.log('Seeding chains...');
      await db.insert(schema.chains).values(schema.seedChains)
        .onConflictDoUpdate({
          target: schema.chains.chainId,
          set: {
            chainName: sql`EXCLUDED.chain_name`,
            rpcUrl: sql`EXCLUDED.rpc_url`,
            explorerUrl: sql`EXCLUDED.explorer_url`,
            isActive: sql`EXCLUDED.is_active`
          }
        });
      console.log('✅ Seeding completed successfully!');
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      throw error;
    }
  }

async function migrateDB() {
    console.log('🚀 Starting database migration...');
    
    try {
        await migrate(db, { migrationsFolder: './drizzle' });
      console.log('✅ Migration completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

// Export the seed function
export { seedDB, migrateDB };