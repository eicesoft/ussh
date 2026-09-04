import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function ConfirmDeleteDialog({ open, node, onClose, onConfirm }) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {node?.type === 'workspace' ? '删除工作区？' : node?.type === 'folder' ? '删除文件夹？' : '删除连接？'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {node?.type === 'workspace'
              ? `将删除工作区「${node?.name}」及其中保存的连接标签页。此操作不可撤销。`
              : node?.type === 'folder'
              ? `将删除文件夹「${node?.name}」，其中的连接会移到根目录。此操作不可撤销。`
              : `将删除「${node?.name}」的元数据以及系统密钥环中保存的密码或私钥。此操作不可撤销。`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
