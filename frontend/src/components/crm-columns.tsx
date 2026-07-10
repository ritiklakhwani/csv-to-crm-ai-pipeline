import type { CrmRecord } from '@groweasy/shared';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Column } from '@/components/VirtualTable';

/** The 15 CRM fields as table columns, with the status field rendered as a coloured badge. */
export const CRM_COLUMNS: Column<CrmRecord>[] = [
  { key: 'created_at', label: 'Created At', width: 175, mono: true },
  { key: 'name', label: 'Name', width: 160 },
  { key: 'email', label: 'Email', width: 210 },
  { key: 'country_code', label: 'Code', width: 80, mono: true },
  { key: 'mobile_without_country_code', label: 'Mobile', width: 130, mono: true },
  { key: 'company', label: 'Company', width: 150 },
  { key: 'city', label: 'City', width: 120 },
  { key: 'state', label: 'State', width: 120 },
  { key: 'country', label: 'Country', width: 110 },
  { key: 'lead_owner', label: 'Lead Owner', width: 190 },
  {
    key: 'crm_status',
    label: 'Status',
    width: 140,
    render: (row) => <StatusBadge status={row.crm_status} />,
  },
  { key: 'crm_note', label: 'Note', width: 280 },
  { key: 'data_source', label: 'Source', width: 140, mono: true },
  { key: 'possession_time', label: 'Possession', width: 130 },
  { key: 'description', label: 'Description', width: 200 },
];
