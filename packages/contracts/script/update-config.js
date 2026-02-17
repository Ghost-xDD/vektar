#!/usr/bin/env node
/**
 * Update config.json with deployed contract addresses
 * Usage: node update-config.js <escrow_address> <vault_address>
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length !== 2) {
  console.error('Usage: node update-config.js <escrow_address> <vault_address>');
  console.error('Example: node update-config.js 0x123... 0x456...');
  process.exit(1);
}

const [escrowAddress, vaultAddress] = args;

// Validate addresses
const addressRegex = /^0x[a-fA-F0-9]{40}$/;
if (!addressRegex.test(escrowAddress) || !addressRegex.test(vaultAddress)) {
  console.error('Error: Invalid Ethereum address format');
  process.exit(1);
}

// Update config.json
const configPath = path.join(__dirname, '../../../apps/cre-workflow/vektar-engine/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const oldEscrow = config.polygon.escrowAddress;
const oldVault = config.base.vaultAddress;

config.polygon.escrowAddress = escrowAddress;
config.base.vaultAddress = vaultAddress;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

console.log('✅ Updated config.json:');
console.log(`   polygon.escrowAddress: ${oldEscrow} → ${escrowAddress}`);
console.log(`   base.vaultAddress: ${oldVault} → ${vaultAddress}`);
console.log('');

// Update .env if it exists
const envPath = path.join(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Update or append addresses
  if (envContent.includes('COLLATERAL_ESCROW_ADDRESS=')) {
    envContent = envContent.replace(
      /COLLATERAL_ESCROW_ADDRESS=.*/,
      `COLLATERAL_ESCROW_ADDRESS=${escrowAddress}`
    );
  } else {
    envContent += `\nCOLLATERAL_ESCROW_ADDRESS=${escrowAddress}`;
  }
  
  if (envContent.includes('HORIZON_VAULT_ADDRESS=')) {
    envContent = envContent.replace(
      /HORIZON_VAULT_ADDRESS=.*/,
      `HORIZON_VAULT_ADDRESS=${vaultAddress}`
    );
  } else {
    envContent += `\nHORIZON_VAULT_ADDRESS=${vaultAddress}`;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Updated .env with contract addresses');
} else {
  console.log('⚠️  .env not found - skipping .env update');
}

console.log('');
console.log('Next steps:');
console.log('1. Get testnet tokens:');
console.log('   - Polygon Amoy: https://faucet.polygon.technology/');
console.log('   - Base Sepolia: https://www.alchemy.com/faucets/base-sepolia');
console.log('2. Add test users to config.json watchedUsers array');
console.log('3. Run CRE simulation:');
console.log('   cd apps/cre-workflow');
console.log('   cre workflow simulate vektar-engine --non-interactive --trigger-index 0 --target local-simulation');
