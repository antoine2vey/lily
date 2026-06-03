export const RoleBadge = ({ role }: { readonly role: string }) => (
  <span
    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
      role === 'admin'
        ? 'bg-primary-100 text-primary-700'
        : 'bg-gray-100 text-gray-600'
    }`}
  >
    {role}
  </span>
)
