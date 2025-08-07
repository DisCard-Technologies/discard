declare module 'wallet-address-validator' {
  interface ValidationOptions {
    networkType?: 'prod' | 'testnet' | 'both';
  }

  function validate(address: string, currency: string, options?: ValidationOptions): boolean;
  
  export = validate;
}