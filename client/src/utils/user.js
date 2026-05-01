export const ROLE_META = {
  1: { label: '学生', color: 'blue' },
  2: { label: '教师', color: 'purple' },
  9: { label: '管理员', color: 'red' },
};

export const getRoleMeta = (role) => ROLE_META[Number(role)] || { label: '未知角色', color: 'default' };
export const getRoleLabel = (role) => getRoleMeta(role).label;
