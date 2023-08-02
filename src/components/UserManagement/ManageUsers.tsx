import React, { useContext, useMemo, useState } from 'react';
import { List } from '../List/List';
import Image from 'next/image';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import ProfileIcon from '@/assets/icons/profile.svg';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { ActionsMenu } from '../UI/Menu/Menu';
import useSWR from 'swr';
import { backendUrl } from '@/config/constant';
import ConfirmationDialog from '../Dialog/ConfirmationDialog';
import { httpPost } from '@/helpers/http';
import { useSession } from 'next-auth/react';
import { errorToast, successToast } from '../ToastMessage/ToastHelper';
import { GlobalContext } from '@/contexts/ContextProvider';

const headers = ['Email', 'Role'];

type Org = {
  name: string;
  slug: string;
  airbyte_workspace_id: string;
};

type OrgUser = {
  email: string;
  active: boolean;
  role: number;
  role_slug: string;
  org: Org;
};

interface ManageUsersInterface {
  setMutateInvitations: (...args: any) => any;
}

const ManageUsers = ({ setMutateInvitations }: ManageUsersInterface) => {
  const { data, isLoading, mutate } = useSWR(
    `${backendUrl}/api/organizations/users`
  );
  const globalContext = useContext(GlobalContext);
  const { data: session }: any = useSession();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showConfirmDeleteDialog, setShowConfirmDeleteDialog] =
    useState<boolean>(false);
  const [orguserToBeDeleted, setOrguserToBeDeleted] = useState<OrgUser | null>(
    null
  );
  const openActionMenu = Boolean(anchorEl);
  const handleClick = (orguser: OrgUser, event: HTMLElement | null) => {
    setOrguserToBeDeleted(orguser);
    setAnchorEl(event);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleClickDeleteAction = () => {
    handleClose();
    setShowConfirmDeleteDialog(true);
  };

  const handleCancelDeleteOrguser = () => {
    setOrguserToBeDeleted(null);
    setShowConfirmDeleteDialog(false);
  };

  let rows = [];
  rows = useMemo(() => {
    if (data && data.length >= 0) {
      return data.map((orguser: OrgUser, idx: number) => [
        <Box
          key={'email-' + idx}
          sx={{ display: 'flex', alignItems: 'center' }}
        >
          <Image
            src={ProfileIcon}
            style={{ marginRight: 10 }}
            alt="person icon"
          />
          <Typography variant="body1" fontWeight={600}>
            {orguser.email}
          </Typography>
        </Box>,
        <Typography key={'role-' + idx} variant="subtitle2" fontWeight={600}>
          {orguser.role_slug.replace('_', ' ')}
        </Typography>,
        <Box
          sx={{ justifyContent: 'end', display: 'flex' }}
          key={'action-box-' + idx}
        >
          <Button
            aria-controls={openActionMenu ? 'basic-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={openActionMenu ? 'true' : undefined}
            onClick={(event) => handleClick(orguser, event.currentTarget)}
            variant="contained"
            key={'menu-' + idx}
            color="info"
            sx={{ px: 0, minWidth: 32 }}
          >
            <MoreHorizIcon />
          </Button>
        </Box>,
      ]);
    }
    return [];
  }, [data]);

  const deleteOrgUser = async (orguser: OrgUser | null) => {
    if (orguser) {
      setLoading(true);
      try {
        await httpPost(session, `organizations/users/delete`, {
          email: orguser.email,
        });
        successToast(
          'Organization user deleted successfully',
          [],
          globalContext
        );
        mutate();
        setMutateInvitations(true);
      } catch (err: any) {
        console.error(err);
        errorToast(err.message, [], globalContext);
      }
      setLoading(false);
    }
    handleCancelDeleteOrguser();
  };

  if (isLoading) {
    return <CircularProgress />;
  }

  return (
    <>
      <ActionsMenu
        eleType="usermanagement"
        anchorEl={anchorEl}
        open={openActionMenu}
        handleClose={handleClose}
        handleDelete={handleClickDeleteAction}
      />
      <List
        openDialog={() => {}}
        title="User"
        headers={headers}
        rows={rows}
        onlyList={true}
      />
      <ConfirmationDialog
        show={showConfirmDeleteDialog}
        handleClose={() => handleCancelDeleteOrguser()}
        handleConfirm={() => deleteOrgUser(orguserToBeDeleted)}
        message="This will delete the organization user permanently. The user will have to be invited again to join the platform"
        loading={loading}
      />
    </>
  );
};

export default ManageUsers;
