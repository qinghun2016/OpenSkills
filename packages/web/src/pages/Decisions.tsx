import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useDecisions } from '@/hooks/useApi';
import { DecisionsList } from '@/components/decisions/DecisionsList';
import { Pagination } from '@/components/ui';

export function Decisions() {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const { data: decisions = [], isLoading } = useDecisions({ search: search || undefined });

  // Calculate pagination
  const totalPages = Math.ceil(decisions.length / itemsPerPage);
  const paginatedDecisions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return decisions.slice(start, end);
  }, [decisions, currentPage, itemsPerPage]);

  // Reset to page 1 when decisions change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [decisions.length, totalPages, currentPage]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-4xl space-y-4"
    >
      <DecisionsList 
        decisions={paginatedDecisions} 
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
      />
      {decisions.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={decisions.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}
    </motion.div>
  );
}
