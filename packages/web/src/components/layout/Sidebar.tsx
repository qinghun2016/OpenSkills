import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Sparkles,
  FileText,
  CheckCircle,
  Bot,
  Shield,
  Settings,
  Sliders,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/skills', label: 'Skills', icon: Sparkles },
  { path: '/proposals', label: 'Proposals', icon: FileText },
  { path: '/decisions', label: 'Decisions', icon: CheckCircle },
  { path: '/crawler', label: 'Crawler', icon: Bot },
  { path: '/admin', label: 'Admin', icon: Shield },
];

const bottomNavItems = [
  { path: '/preferences', label: 'Preferences', icon: Sliders },
  { path: '/config', label: 'Config', icon: Settings },
];

export function Sidebar({ collapsed, onCollapsedChange }: SidebarProps) {
  const location = useLocation();

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 256 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-card"
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-border px-4">
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3"
          >
            <img
              src="/favicon.svg"
              alt="OpenSkills"
              className="h-9 w-9 shrink-0 rounded-lg object-contain"
            />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="font-semibold"
                >
                  OpenSkills
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <NavItem
              key={item.path}
              {...item}
              collapsed={collapsed}
              isActive={location.pathname === item.path}
            />
          ))}
        </nav>

        {/* Bottom Navigation */}
        <div className="border-t border-border p-2">
          {bottomNavItems.map((item) => (
            <NavItem
              key={item.path}
              {...item}
              collapsed={collapsed}
              isActive={location.pathname === item.path}
            />
          ))}

          {/* Collapse Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapsedChange(!collapsed)}
            className="mt-2 w-full justify-center"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-2">收起</span>
              </>
            )}
          </Button>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}

interface NavItemProps {
  path: string;
  label: string;
  icon: React.ElementType;
  collapsed: boolean;
  isActive: boolean;
}

function NavItem({ path, label, icon: Icon, collapsed, isActive }: NavItemProps) {
  const content = (
    <NavLink
      to={path}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute left-0 h-8 w-1 rounded-r-full bg-primary"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return <div className="relative">{content}</div>;
}
