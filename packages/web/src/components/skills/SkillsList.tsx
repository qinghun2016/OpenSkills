import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScopeBadge } from '@/components/common/ScopeBadge';
import { formatRelativeTime } from '@/lib/utils';
import type { Skill } from '@/api/types';

interface SkillsListProps {
  skills: Skill[];
  isLoading?: boolean;
  onSelect?: (skill: Skill) => void;
  selectedSkill?: Skill | null;
  search?: string;
  onSearchChange?: (search: string) => void;
  scopeFilter?: 'all' | 'user' | 'project';
  onScopeFilterChange?: (filter: 'all' | 'user' | 'project') => void;
  typeFilter?: 'all' | 'skill' | 'rule';
  onTypeFilterChange?: (filter: 'all' | 'skill' | 'rule') => void;
}

export function SkillsList({
  skills,
  isLoading,
  onSelect,
  selectedSkill,
  search: externalSearch,
  onSearchChange: externalOnSearchChange,
  scopeFilter: externalScopeFilter,
  onScopeFilterChange: externalOnScopeFilterChange,
  typeFilter: externalTypeFilter,
  onTypeFilterChange: externalOnTypeFilterChange,
}: SkillsListProps) {
  // Use external filters if provided, otherwise use internal state
  const [internalSearch, setInternalSearch] = useState('');
  const [internalScopeFilter, setInternalScopeFilter] = useState<'all' | 'user' | 'project'>('all');
  const [internalTypeFilter, setInternalTypeFilter] = useState<'all' | 'skill' | 'rule'>('all');

  const search = externalSearch !== undefined ? externalSearch : internalSearch;
  const setSearch = externalOnSearchChange || setInternalSearch;
  const scopeFilter = externalScopeFilter !== undefined ? externalScopeFilter : internalScopeFilter;
  const setScopeFilter = externalOnScopeFilterChange || setInternalScopeFilter;
  const typeFilter = externalTypeFilter !== undefined ? externalTypeFilter : internalTypeFilter;
  const setTypeFilter = externalOnTypeFilterChange || setInternalTypeFilter;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索 Skill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            <span className="px-2 text-xs text-muted-foreground">类型:</span>
            {(['all', 'skill', 'rule'] as const).map((type) => (
              <Button
                key={type}
                variant={typeFilter === type ? 'secondary' : 'ghost'}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setTypeFilter(type);
                }}
                className={`capitalize ${
                  typeFilter === type 
                    ? 'bg-primary/20 text-primary font-semibold border border-primary/30' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {type === 'all' ? '全部' : type === 'skill' ? 'Skill' : 'Rule'}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            <span className="px-2 text-xs text-muted-foreground">范围:</span>
            {(['all', 'user', 'project'] as const).map((scope) => (
              <Button
                key={scope}
                variant={scopeFilter === scope ? 'secondary' : 'ghost'}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setScopeFilter(scope);
                }}
                className={`capitalize ${
                  scopeFilter === scope 
                    ? 'bg-primary/20 text-primary font-semibold border border-primary/30' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {scope === 'all' ? '全部' : scope === 'user' ? '用户' : '项目'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      {skills.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="暂无 Skills"
          description={search ? '未找到匹配的 Skill' : '还没有创建任何 Skill'}
        />
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-2">
            {skills.map((skill, index) => (
              <motion.div
                key={`${skill.scope}-${skill.name}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className={`cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-md ${
                    selectedSkill?.name === skill.name &&
                    selectedSkill?.scope === skill.scope
                      ? 'border-primary bg-primary/5'
                      : ''
                  }`}
                  onClick={() => onSelect?.(skill)}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">
                            {skill.scope === 'user' && skill.name.startsWith('cursor-user-rule-') && skill.description
                              ? skill.description
                              : skill.name}
                          </h3>
                          {skill.type === 'rule' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400">
                              规则
                            </span>
                          )}
                        </div>
                        {skill.description && !(skill.scope === 'user' && skill.name.startsWith('cursor-user-rule-')) && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {skill.description}
                          </p>
                        )}
                        {skill.scope === 'user' && skill.name.startsWith('cursor-user-rule-') && (
                          <p className="text-xs text-muted-foreground">{skill.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ScopeBadge scope={skill.scope} />
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(skill.lastModified)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
