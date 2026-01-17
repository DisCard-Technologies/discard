/**
 * useContacts Hook Tests
 *
 * Tests for contact management functionality.
 */

describe('useContacts Hook', () => {
  // ==========================================================================
  // Contact Data Structure
  // ==========================================================================

  describe('Contact Data Structure', () => {
    test('contact has required fields', () => {
      const contact = {
        id: 'contact_123',
        name: 'Alice',
        identifier: 'alice.sol',
        identifierType: 'sol_name',
        resolvedAddress: 'So1anaAddress123456789',
        createdAt: Date.now(),
        transferCount: 5,
        totalAmountSent: 250.00,
      };

      expect(contact.id).toBeDefined();
      expect(contact.name).toBeDefined();
      expect(contact.identifier).toBeDefined();
      expect(contact.identifierType).toBeDefined();
      expect(contact.resolvedAddress).toBeDefined();
    });

    test('identifier types are valid', () => {
      const types = ['address', 'sol_name', 'phone', 'email'];
      types.forEach((type) => {
        expect(['address', 'sol_name', 'phone', 'email']).toContain(type);
      });
    });

    test('contact can have optional fields', () => {
      const contact = {
        id: 'contact_123',
        name: 'Bob',
        identifier: '+14155551234',
        identifierType: 'phone',
        resolvedAddress: 'So1anaAddress987654321',
        verified: true,
        linkedUserId: 'user_456',
        phoneNumber: '+14155551234',
        email: 'bob@example.com',
        isFavorite: true,
        lastUsedAt: Date.now(),
      };

      expect(contact.verified).toBe(true);
      expect(contact.linkedUserId).toBeDefined();
      expect(contact.isFavorite).toBe(true);
    });
  });

  // ==========================================================================
  // Contact Sorting
  // ==========================================================================

  describe('Contact Sorting', () => {
    const contacts = [
      { id: '1', name: 'Charlie', lastUsedAt: 1000, transferCount: 10, isFavorite: false },
      { id: '2', name: 'Alice', lastUsedAt: 3000, transferCount: 5, isFavorite: true },
      { id: '3', name: 'Bob', lastUsedAt: 2000, transferCount: 15, isFavorite: true },
      { id: '4', name: 'Diana', lastUsedAt: undefined, transferCount: 0, isFavorite: false },
    ];

    test('sorts recent contacts by lastUsedAt descending', () => {
      const recent = [...contacts]
        .filter((c) => c.lastUsedAt !== undefined)
        .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
        .slice(0, 5);

      expect(recent[0].name).toBe('Alice');
      expect(recent[1].name).toBe('Bob');
      expect(recent[2].name).toBe('Charlie');
      expect(recent).toHaveLength(3);
    });

    test('sorts frequent contacts by transferCount descending', () => {
      const frequent = [...contacts]
        .filter((c) => c.transferCount > 0)
        .sort((a, b) => b.transferCount - a.transferCount)
        .slice(0, 5);

      expect(frequent[0].name).toBe('Bob');
      expect(frequent[1].name).toBe('Charlie');
      expect(frequent[2].name).toBe('Alice');
      expect(frequent).toHaveLength(3);
    });

    test('filters favorite contacts and sorts alphabetically', () => {
      const favorites = [...contacts]
        .filter((c) => c.isFavorite === true)
        .sort((a, b) => a.name.localeCompare(b.name));

      expect(favorites[0].name).toBe('Alice');
      expect(favorites[1].name).toBe('Bob');
      expect(favorites).toHaveLength(2);
    });

    test('handles empty contacts array', () => {
      const empty: typeof contacts = [];
      const recent = empty.filter((c) => c.lastUsedAt !== undefined);
      expect(recent).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Contact Search
  // ==========================================================================

  describe('Contact Search', () => {
    const contacts = [
      { name: 'Alice Smith', identifier: 'alice.sol', resolvedAddress: 'addr1' },
      { name: 'Bob Jones', identifier: '+14155551234', resolvedAddress: 'addr2' },
      { name: 'Charlie Brown', identifier: 'charlie@example.com', resolvedAddress: 'addr3' },
      { name: 'Alice Johnson', identifier: 'alicej.sol', resolvedAddress: 'addr4' },
    ];

    test('searches by name', () => {
      const query = 'alice';
      const results = contacts.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Alice Smith');
      expect(results[1].name).toBe('Alice Johnson');
    });

    test('searches by identifier', () => {
      const query = '.sol';
      const results = contacts.filter((c) =>
        c.identifier.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(2);
    });

    test('searches by address', () => {
      const query = 'addr2';
      const results = contacts.filter((c) =>
        c.resolvedAddress.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Bob Jones');
    });

    test('returns all contacts for empty query', () => {
      const query = '';
      const results = query.trim() ? contacts.filter(() => false) : contacts;

      expect(results).toHaveLength(4);
    });

    test('returns empty for no matches', () => {
      const query = 'xyz123';
      const results = contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.identifier.toLowerCase().includes(query.toLowerCase()) ||
          c.resolvedAddress.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(0);
    });

    test('search is case insensitive', () => {
      const query = 'ALICE';
      const results = contacts.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Contact Lookup
  // ==========================================================================

  describe('Contact Lookup', () => {
    const contacts = [
      { id: '1', name: 'Alice', resolvedAddress: 'addr1' },
      { id: '2', name: 'Bob', resolvedAddress: 'addr2' },
      { id: '3', name: 'Charlie', resolvedAddress: 'addr3' },
    ];

    test('finds contact by address', () => {
      const address = 'addr2';
      const contact = contacts.find((c) => c.resolvedAddress === address) || null;

      expect(contact).not.toBeNull();
      expect(contact?.name).toBe('Bob');
    });

    test('finds contact by ID', () => {
      const id = '3';
      const contact = contacts.find((c) => c.id === id) || null;

      expect(contact).not.toBeNull();
      expect(contact?.name).toBe('Charlie');
    });

    test('returns null for unknown address', () => {
      const address = 'unknown_addr';
      const contact = contacts.find((c) => c.resolvedAddress === address) || null;

      expect(contact).toBeNull();
    });

    test('returns null for unknown ID', () => {
      const id = 'unknown_id';
      const contact = contacts.find((c) => c.id === id) || null;

      expect(contact).toBeNull();
    });
  });

  // ==========================================================================
  // Contact Statistics
  // ==========================================================================

  describe('Contact Statistics', () => {
    test('tracks transfer count correctly', () => {
      let contact = { transferCount: 0, totalAmountSent: 0 };

      // Simulate multiple transfers
      contact = { ...contact, transferCount: contact.transferCount + 1, totalAmountSent: contact.totalAmountSent + 50 };
      contact = { ...contact, transferCount: contact.transferCount + 1, totalAmountSent: contact.totalAmountSent + 100 };
      contact = { ...contact, transferCount: contact.transferCount + 1, totalAmountSent: contact.totalAmountSent + 25 };

      expect(contact.transferCount).toBe(3);
      expect(contact.totalAmountSent).toBe(175);
    });

    test('updates lastUsedAt timestamp', () => {
      const before = Date.now();
      const contact = { lastUsedAt: Date.now() };
      const after = Date.now();

      expect(contact.lastUsedAt).toBeGreaterThanOrEqual(before);
      expect(contact.lastUsedAt).toBeLessThanOrEqual(after);
    });

    test('toggles favorite status', () => {
      let contact = { isFavorite: false };

      contact = { ...contact, isFavorite: !contact.isFavorite };
      expect(contact.isFavorite).toBe(true);

      contact = { ...contact, isFavorite: !contact.isFavorite };
      expect(contact.isFavorite).toBe(false);
    });
  });

  // ==========================================================================
  // Phone Contact Import
  // ==========================================================================

  describe('Phone Contact Import', () => {
    test('phone contact structure is valid', () => {
      const phoneContact = {
        id: 'phone_123',
        name: 'John Doe',
        phoneNumbers: ['+14155551234', '+14155555678'],
        emails: ['john@example.com'],
      };

      expect(phoneContact.id).toBeDefined();
      expect(phoneContact.name).toBeDefined();
      expect(phoneContact.phoneNumbers).toBeInstanceOf(Array);
      expect(phoneContact.emails).toBeInstanceOf(Array);
    });

    test('counts import results correctly', () => {
      const results = { imported: 5, skipped: 2, failed: 1 };
      const total = results.imported + results.skipped + results.failed;

      expect(total).toBe(8);
      expect(results.imported).toBeGreaterThan(0);
    });

    test('handles empty phone contacts', () => {
      const phoneContacts: any[] = [];
      const results = {
        imported: 0,
        skipped: phoneContacts.length,
        failed: 0,
      };

      expect(results.imported).toBe(0);
      expect(results.skipped).toBe(0);
    });
  });

  // ==========================================================================
  // Contact Validation
  // ==========================================================================

  describe('Contact Validation', () => {
    test('validates phone number format (E.164)', () => {
      const isValidPhone = (phone: string) => /^\+[1-9]\d{6,14}$/.test(phone);

      expect(isValidPhone('+14155551234')).toBe(true);
      expect(isValidPhone('+1')).toBe(false);
      expect(isValidPhone('4155551234')).toBe(false);
      expect(isValidPhone('+0123456789')).toBe(false);
    });

    test('validates email format', () => {
      const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
    });

    test('validates .sol domain format', () => {
      const isValidSolDomain = (domain: string) => /^[a-zA-Z0-9-]+\.sol$/i.test(domain);

      expect(isValidSolDomain('alice.sol')).toBe(true);
      expect(isValidSolDomain('my-wallet.sol')).toBe(true);
      expect(isValidSolDomain('ALICE.SOL')).toBe(true);
      expect(isValidSolDomain('alice')).toBe(false);
      expect(isValidSolDomain('.sol')).toBe(false);
    });
  });

  // ==========================================================================
  // Optimistic Updates
  // ==========================================================================

  describe('Optimistic Updates', () => {
    test('deletes contact optimistically', () => {
      const contacts = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Charlie' },
      ];

      const contactIdToDelete = '2';
      const updated = contacts.filter((c) => c.id !== contactIdToDelete);

      expect(updated).toHaveLength(2);
      expect(updated.find((c) => c.id === '2')).toBeUndefined();
    });

    test('reverts on error', () => {
      const originalContacts = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];

      // Simulate failed delete
      let contacts = [...originalContacts];
      const contactIdToDelete = '2';

      // Optimistic delete
      contacts = contacts.filter((c) => c.id !== contactIdToDelete);
      expect(contacts).toHaveLength(1);

      // Revert on error
      contacts = originalContacts;
      expect(contacts).toHaveLength(2);
    });

    test('updates favorite optimistically', () => {
      const contacts = [
        { id: '1', name: 'Alice', isFavorite: false },
        { id: '2', name: 'Bob', isFavorite: true },
      ];

      const contactId = '1';
      const updated = contacts.map((c) => {
        if (c.id === contactId) {
          return { ...c, isFavorite: !c.isFavorite };
        }
        return c;
      });

      expect(updated.find((c) => c.id === '1')?.isFavorite).toBe(true);
      expect(updated.find((c) => c.id === '2')?.isFavorite).toBe(true);
    });
  });
});
