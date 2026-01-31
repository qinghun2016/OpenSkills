import { motion } from 'framer-motion';
import { CrawlerPanel } from '@/components/crawler/CrawlerPanel';

export function Crawler() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <CrawlerPanel />
    </motion.div>
  );
}
