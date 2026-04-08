import { redirect } from 'next/navigation';

export default function ArchivedPage() {
  redirect('/assets?archived=intelligence');
}
