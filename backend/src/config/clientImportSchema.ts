export type ClientImportFieldType = 'text' | 'email' | 'phone' | 'date' | 'select';

export type ClientImportField = {
  /** Field key must match the createClient payload key. */
  key: string;
  /** Column header label shown to user (required fields will be suffixed with * in the template). */
  label: string;
  required?: boolean;
  type: ClientImportFieldType;
  /** Allowed options for select fields. */
  options?: string[];
  /** Example/sample value for the sample row. */
  sample?: string;
  /** Optional note for instructions. */
  note?: string;
};

/**
 * Single Source of Truth:
 * This schema must match the "Add Client" form fields (order + validation expectations).
 * Template generation, import validation, and export format are all driven by this.
 */
export const CLIENT_IMPORT_SCHEMA: ClientImportField[] = [
  {
    key: 'name',
    label: 'Client Name',
    required: true,
    type: 'text',
    sample: 'John Smith',
  },
  {
    key: 'isCorporate',
    label: 'Client Type',
    required: true,
    type: 'select',
    options: ['Person', 'Company'],
    sample: 'Person',
  },
  {
    key: 'leadSource',
    label: 'Lead Source',
    required: false,
    type: 'select',
    options: ['Social Media', 'Company Website', 'Friends', 'Referral'],
    sample: 'Company Website',
  },
  {
    key: 'rank',
    label: 'Rank',
    required: false,
    type: 'select',
    options: ['Diamond', 'Platinum', 'Gold', 'Silver', 'Bronze'],
    sample: 'Gold',
  },
  {
    key: 'email',
    label: 'Email',
    required: false,
    type: 'email',
    sample: 'client@example.com',
  },
  {
    key: 'phone',
    label: 'Phone',
    required: false,
    type: 'phone',
    sample: '+971501234567',
    note: 'Use international format (e.g., +971501234567).',
  },
  {
    key: 'address',
    label: 'Address',
    required: false,
    type: 'text',
    sample: 'Dubai, UAE',
  },
  {
    key: 'nationality',
    label: 'Nationality',
    required: false,
    type: 'text',
    sample: 'Emirati',
  },
  {
    key: 'idNumber',
    label: 'ID Number',
    required: false,
    type: 'text',
    sample: '784-1985-1234567-1',
  },
  {
    key: 'idExpiryDate',
    label: 'ID Expiry Date',
    required: false,
    type: 'date',
    sample: '2028-12-31',
    note: 'Use YYYY-MM-DD.',
  },
  {
    key: 'passportNumber',
    label: 'Passport Number',
    required: false,
    type: 'text',
    sample: 'A12345678',
  },
  {
    key: 'birthDate',
    label: 'Birth Date',
    required: false,
    type: 'date',
    sample: '1990-01-15',
    note: 'Use YYYY-MM-DD.',
  },
];

