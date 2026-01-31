import { motion } from 'framer-motion';
import { AdminPanel } from '@/components/admin/AdminPanel';

export function Admin() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <AdminPanel />
    </motion.div>
  );
}
