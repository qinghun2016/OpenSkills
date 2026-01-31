import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Menu,
  Sun,
  Moon,
  Monitor,
  Bell,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/components/ThemeProvider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

interface HeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/skills': 'Skills 管理',
  '/proposals': '提议列表',
  '/decisions': '决策历史',
  '/crawler': 'Crawler',
  '/admin': '管理员面板',
  '/preferences': '偏好设置',
  '/config': '系统配置',
};

export function Header({ sidebarCollapsed, onToggleSidebar }: HeaderProps) {
  const location = useLocation();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const title = pageTitles[location.pathname] || 'OpenSkills';

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <TooltipProvider>
      <header
        className={cn(
          'fixed right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6 transition-all duration-300',
          sidebarCollapsed ? 'left-16' : 'left-64'
        )}
      >
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <motion.h1
            key={location.pathname}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-xl font-semibold"
          >
            {title}
          </motion.h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索... (⌘K)"
              className="w-64 bg-background pl-9"
            />
          </div>

          {/* Notifications */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>通知</TooltipContent>
          </Tooltip>

          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={cycleTheme}>
                <ThemeIcon className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {theme === 'system' ? '跟随系统' : theme === 'dark' ? '深色模式' : '浅色模式'}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}
