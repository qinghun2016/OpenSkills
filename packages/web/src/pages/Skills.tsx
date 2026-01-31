import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui';
import { useSkills, useSkill } from '@/hooks/useApi';
import { SkillsList } from '@/components/skills/SkillsList';
import { SkillDetail } from '@/components/skills/SkillDetail';
import type { Skill } from '@/api/types';

export function Skills() {
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'user' | 'project'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'skill' | 'rule'>('all');
  const { data: skills = [], isLoading, refetch, isRefetching } = useSkills();

  // 获取选中 Skill 的详情
  const { data: skillDetail, isLoading: isLoadingDetail, isError: isErrorDetail } = useSkill(
    selectedSkill?.name || '',
    selectedSkill?.scope || 'user'
  );

  // Filter skills first
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      // 搜索匹配
      const matchesSearch = !search || skill.name.toLowerCase().includes(search.toLowerCase());
      
      // 范围匹配：'all' 匹配所有，否则必须严格匹配
      const matchesScope = scopeFilter === 'all' || skill.scope === scopeFilter;
      
      // 类型匹配
      let matchesType = true;
      if (typeFilter === 'rule') {
        // 规则类型：必须明确标记为 'rule'
        matchesType = skill.type === 'rule';
      } else if (typeFilter === 'skill') {
        // Skill 类型：明确标记为 'skill' 或未定义（默认为 skill）
        matchesType = skill.type === 'skill' || skill.type === undefined;
      }
      // typeFilter === 'all' 时，matchesType 保持为 true，匹配所有类型
      
      // 所有条件必须同时满足
      return matchesSearch && matchesScope && matchesType;
    });
  }, [skills, search, scopeFilter, typeFilter]);

  // Calculate pagination on filtered results
  const totalPages = Math.ceil(filteredSkills.length / itemsPerPage);
  const paginatedSkills = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredSkills.slice(startIndex, endIndex);
  }, [filteredSkills, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, scopeFilter, typeFilter]);

  // 选择「用户」范围时强制刷新列表，确保用户级 Rule 显示最新（避免缓存导致未更新）
  useEffect(() => {
    if (scopeFilter === 'user') {
      refetch();
    }
  }, [scopeFilter, refetch]);

  // 键盘导航 - 使用 filteredSkills 而不是 skills
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!filteredSkills.length) return;

      const currentIndex = selectedSkill
        ? filteredSkills.findIndex(
            (s) => s.name === selectedSkill.name && s.scope === selectedSkill.scope
          )
        : -1;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < filteredSkills.length - 1 ? currentIndex + 1 : 0;
        setSelectedSkill(filteredSkills[nextIndex]);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredSkills.length - 1;
        setSelectedSkill(filteredSkills[prevIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredSkills, selectedSkill]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 gap-6 lg:grid-cols-5"
    >
      {/* Skills List */}
      <div className="lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            共 {filteredSkills.length} 个 Skills {filteredSkills.length !== skills.length && `(共 ${skills.length} 个)`}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
        <SkillsList
          skills={paginatedSkills}
          isLoading={isLoading}
          onSelect={setSelectedSkill}
          selectedSkill={selectedSkill}
          search={search}
          onSearchChange={setSearch}
          scopeFilter={scopeFilter}
          onScopeFilterChange={setScopeFilter}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
        />
        {filteredSkills.length > 0 && (
          <div className="mt-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              totalItems={filteredSkills.length}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          </div>
        )}
      </div>

      {/* Skill Detail */}
      <div className="lg:col-span-3">
        <SkillDetail
          skill={skillDetail || selectedSkill}
          isLoading={isLoadingDetail}
          isError={isErrorDetail}
          onSaveSuccess={() => refetch()}
        />
      </div>
    </motion.div>
  );
}
