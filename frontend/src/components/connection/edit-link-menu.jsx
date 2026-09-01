import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Pencil, ExternalLink, Trash2 } from 'lucide-react';

export function EditLinkMenu({ node, onOpen, onEdit, onDelete, trigger, anchorOrigin }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="right"
        {...(anchorOrigin || {})}
        onClick={event => event.stopPropagation()}
      >
        {onOpen && (
          <DropdownMenuItem onSelect={() => onOpen(node)}>
            <ExternalLink className="h-3.5 w-3.5" />
            打开
          </DropdownMenuItem>
        )}
        {onEdit && (
          <DropdownMenuItem onSelect={() => onEdit(node)}>
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onDelete(node)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}