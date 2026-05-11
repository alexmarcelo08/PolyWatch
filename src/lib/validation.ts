const ETH_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isValidWalletAddress(address: string) {
  return ETH_ADDRESS_PATTERN.test(address.trim());
}

export function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

export function compactAddress(address: string) {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
