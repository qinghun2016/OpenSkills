import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PlusCircle } from 'lucide-react';
import { useProposals, useProposal } from '@/hooks/useApi';
import { ProposalsList, ProposalDetail, CreateProposalForm } from '@/components/proposals';
import { Pagination, Button, Dialog, DialogContent } from '@/components/ui';
import type { ProposalSummary, ProposalStatus, ProposalScope, ProposalTrigger } from '@/api/types';

export function Proposals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProposal, setSelectedProposal] = useState<ProposalSummary | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'all'>('all');
  const [scopeFilter, setScopeFilter] = useState<ProposalScope | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<ProposalTrigger | 'all'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: proposals = [], isLoading, refetch } = useProposals();
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/3b8ce49b-df8e-4d7e-9a9d-6bcf5663853e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'pages/Proposals.tsx:12',message:'Proposals component mount',data:{proposalIdParam:searchParams.get('proposalId'),proposalsCount:proposals.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
  }, []);
  // #endregion

  // 从 URL 参数中获取 proposalId
  useEffect(() => {
    const proposalIdFromUrl = searchParams.get('proposalId');
    if (proposalIdFromUrl && proposals.length > 0 && !isLoading) {
      const proposal = proposals.find(p => p.id === proposalIdFromUrl);
      if (proposal && selectedProposal?.id !== proposal.id) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/3b8ce49b-df8e-4d7e-9a9d-6bcf5663853e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'pages/Proposals.tsx:18',message:'Setting proposal from URL param',data:{proposalId:proposalIdFromUrl,found:!!proposal},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        setSelectedProposal(proposal);
        // 清除 URL 参数，避免重复触发
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, proposals, isLoading, selectedProposal, setSearchParams]);

  // 获取选中提议的详情
  const { data: proposalDetail, isLoading: isLoadingDetail, isError: isErrorDetail, error: proposalError } = useProposal(
    selectedProposal?.id || ''
  );
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/3b8ce49b-df8e-4d7e-9a9d-6bcf5663853e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'pages/Proposals.tsx:25',message:'useProposal result',data:{selectedProposalId:selectedProposal?.id,hasDetail:!!proposalDetail,isLoading:isLoadingDetail,isError:isErrorDetail,errorMessage:proposalError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,D'})}).catch(()=>{});
  }, [selectedProposal?.id, proposalDetail, isLoadingDetail, isErrorDetail, proposalError]);
  // #endregion

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!proposals.length) return;

      const currentIndex = selectedProposal
        ? proposals.findIndex((p) => p.id === selectedProposal.id)
        : -1;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < proposals.length - 1 ? currentIndex + 1 : 0;
        setSelectedProposal(proposals[nextIndex]);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : proposals.length - 1;
        setSelectedProposal(proposals[prevIndex]);
      } else if (e.key === 'Enter' && selectedProposal) {
        // Enter 进入详情（已自动显示）
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [proposals, selectedProposal]);

  const handleActionComplete = () => {
    refetch();
    setSelectedProposal(null);
  };

  // Filter proposals first
  const filteredProposals = useMemo(() => {
    return proposals.filter((proposal) => {
      const matchesSearch = proposal.skillName
        .toLowerCase()
        .includes(search.toLowerCase());
      
      // Status filter：'已批准' 同时匹配 approved 与 applied（后端/归档使用 applied）
      let matchesStatus = true;
      if (statusFilter !== 'all') {
        if (statusFilter === 'approved') {
          matchesStatus = proposal.status === 'approved' || proposal.status === 'applied';
        } else {
          matchesStatus = proposal.status === statusFilter;
        }
      }
      
      const matchesScope =
        scopeFilter === 'all' || proposal.scope === scopeFilter;
      const matchesSource =
        sourceFilter === 'all' || proposal.trigger === sourceFilter;

      return matchesSearch && matchesStatus && matchesScope && matchesSource;
    });
  }, [proposals, search, statusFilter, scopeFilter, sourceFilter]);

  // Calculate pagination on filtered results
  const totalPages = Math.ceil(filteredProposals.length / itemsPerPage);
  const paginatedProposals = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredProposals.slice(start, end);
  }, [filteredProposals, currentPage, itemsPerPage]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, scopeFilter, sourceFilter]);

  // Reset to page 1 when filtered proposals change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [filteredProposals.length, totalPages, currentPage]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 gap-6 lg:grid-cols-5"
    >
      {/* Proposals List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex justify-end mb-2">
          <Button
            data-testid="open-create-proposal"
            onClick={() => setCreateDialogOpen(true)}
            className="gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            新建提议
          </Button>
        </div>
        <ProposalsList
          proposals={paginatedProposals}
          isLoading={isLoading}
          onSelect={setSelectedProposal}
          selectedProposal={selectedProposal}
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          scopeFilter={scopeFilter}
          onScopeFilterChange={setScopeFilter}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
        />
        {filteredProposals.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredProposals.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        )}
      </div>

      {/* Proposal Detail */}
      <div className="lg:col-span-3">
        <ProposalDetail
          proposal={proposalDetail || null}
          isLoading={isLoadingDetail}
          isError={isErrorDetail}
          onActionComplete={handleActionComplete}
        />
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <CreateProposalForm
            onSuccess={() => {
              refetch();
              setCreateDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
