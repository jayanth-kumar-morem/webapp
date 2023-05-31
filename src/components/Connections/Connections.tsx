import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Autocomplete, Box, CircularProgress } from '@mui/material';
import { List } from '../List/List';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { backendUrl } from '@/config/constant';
import { useForm, Controller } from 'react-hook-form';
import { useSession } from 'next-auth/react';
import { httpGet, httpPost } from '@/helpers/http';
import { GlobalContext } from '@/contexts/ContextProvider';
import { useContext } from 'react';
import {
  errorToast,
  successToast,
} from '@/components/ToastMessage/ToastHelper';
import CustomDialog from '../Dialog/CustomDialog';

const headers = ['Connection details', 'Source → Destination', 'Last sync'];

export const Connections = () => {
  const { data: session }: any = useSession();
  const { register, handleSubmit, control, watch, reset } = useForm({
    defaultValues: {
      name: '',
      sources: { label: '', id: '' },
      destinations: { label: '', id: '' },
      destinationSchema: '',
    },
  });

  const watchSourceSelection = watch('sources');

  const [showDialog, setShowDialog] = useState(false);
  const [rows, setRows] = useState<Array<Array<string>>>([]);

  const [sources, setSources] = useState<Array<string>>([]);
  const [sourceStreams, setSourceStreams] = useState<Array<string>>([]);

  const { data, isLoading, mutate } = useSWR(
    `${backendUrl}/api/airbyte/connections`
  );
  const { data: sourcesData } = useSWR(`${backendUrl}/api/airbyte/sources`);

  const toastContext = useContext(GlobalContext);

  const [syncStatus, setSyncStatus] = useState<string>("");
  const [syncLogs, setSyncLogs] = useState<Array<string>>([]);

  // when the connection list changes
  useEffect(() => {
    if (data && data.length > 0) {
      const rows = data.map((connection: any, idx: number) => [
        connection.name,
        connection.sourceDest,
        connection.lastSync,
        [
          <Button
            variant="contained"
            onClick={() => syncConnection(connection)}
            key={idx}
          >
            Sync
          </Button>,
        ],
      ]);
      setRows(rows);
    }
  }, [data]);

  // when the source list changes
  useEffect(() => {
    if (sourcesData && sourcesData.length > 0) {
      const rows = sourcesData.map((element: any) => ({
        label: element.name,
        id: element.sourceId,
      }));
      setSources(rows);
    }
  }, [sourcesData]);

  // source selection changes
  useEffect(() => {
    if (watchSourceSelection?.id) {
      // console.log(watchSourceSelection);

      (async () => {
        try {
          const message = await httpGet(
            session,
            `airbyte/sources/${watchSourceSelection.id}/schema_catalog`
          );
          const streamNames: any[] = [];
          message['catalog']['streams'].forEach((el: any) => {
            streamNames.push(el.stream.name);
          });
          setSourceStreams(streamNames);
        } catch (err: any) {
          console.error(err);
          errorToast(err.message, [], toastContext);
        }
        // message looks like {
        //     "catalog": {
        //         "streams": [
        //             {
        //                 "stream": {
        //                     "name": "ngo1_visits_per_day",
        //                     "jsonSchema": {
        //                         "type": "object",
        //                         "properties": {
        //                             "date": { "format": "date", "type": "string"},
        //                             "gender": { "type": "string"},
        //                             "count": {"airbyte_type": "integer","type": "number"}
        //                         }
        //                     },
        //                     "supportedSyncModes": ["full_refresh","incremental"],
        //                     "defaultCursorField": [],
        //                     "sourceDefinedPrimaryKey": [],
        //                     "namespace": "public"
        //                 },
        //                 "config": {
        //                     "syncMode": "full_refresh",
        //                     "cursorField": [],
        //                     "destinationSyncMode": "append",
        //                     "primaryKey": [],
        //                     "aliasName": "ngo1_visits_per_day",
        //                     "selected": true,
        //                     "suggested": true
        //                 }
        //             }
        //         ]
        //     },
        //     "jobInfo": {
        //         "id": "8004c637-eb94-4d9b-a12a-aa4ca3493534",
        //         "configType": "discover_schema",
        //         "configId": "NoConfiguration",
        //         "createdAt": 0,
        //         "endedAt": 0,
        //         "succeeded": true,
        //         "connectorConfigurationUpdated": false,
        //         "logs": {
        //             "logLines": []
        //         }
        //     },
        //     "catalogId": "f1b42ce1-dc1f-4633-963c-dd28aff0aef9"
        // }
      })();
    }
  }, [watchSourceSelection]);

  // show load progress indicator
  if (isLoading) {
    return <CircularProgress />;
  }

  const handleClickOpen = () => {
    setShowDialog(true);
  };

  const handleClose = () => {
    reset();
    setSourceStreams([]);
    setShowDialog(false);
  };

  // create a new connection
  const onSubmit = async (data: any) => {
    const payload: any = {
      name: data.name,
      sourceId: data.sources.id,
      streamNames: sourceStreams,
    };
    if (data.destinationSchema) {
      payload.destinationSchema = data.destinationSchema;
    }
    try {
      await httpPost(session, 'airbyte/connections/', payload);
      mutate();
      reset();
      handleClose();
      successToast('created connection', [], toastContext);
    } catch (err: any) {
      console.error(err);
      errorToast(err.message, [], toastContext);
    }
  };

  const syncConnection = (connection: any) => {
    console.log(connection);
    (async () => {
      try {
        const message = await httpPost(
          session,
          `airbyte/connections/${connection.blockId}/sync/`,
          {}
        );
        if (message.success) {
          successToast("sync started", [], toastContext);
          if (message.celery_task_id) {
            checkCeleryTask(message.celery_task_id);
          }
        }
      } catch (err: any) {
        console.error(err);
        errorToast(err.message, [], toastContext);
      }
    })();
  };

  const checkCeleryTask = async (celeryTaskId: string) => {
    try {
      const result = await httpGet(session, `tasks/${celeryTaskId}`);
      if (result.progress && result.progress.length > 1) {
        const lastStep = result.progress[1]
        if (lastStep.airbyte_job_num) {
          const airbyteJob = await httpGet(session, `airbyte/jobs/${lastStep.airbyte_job_num}`);
          setSyncStatus(airbyteJob.status);
          if (airbyteJob.status === 'failed') {
            setSyncLogs(airbyteJob.logs);
          }
          if (['succeeded', 'failed'].indexOf(airbyteJob.status) < 0) {
            setTimeout(() => {
              checkCeleryTask(celeryTaskId);
            }, 3000);
          }
          // airbyteJob = {status, logs}
        } else if (lastStep.status) {
          errorToast(lastStep.status, [], toastContext);
        }
      } else {
        setTimeout(() => {
          checkCeleryTask(celeryTaskId);
        }, 3000);
      }
    }
    catch (error: any) {
      setTimeout(() => {
        checkCeleryTask(celeryTaskId);
      }, 5000);
    }
  };

  const CreateConnectionForm = () => {
    return (
      <>
        <Box sx={{ pt: 2, pb: 4 }}>
          <TextField
            sx={{ width: '100%' }}
            label="Name"
            variant="outlined"
            {...register('name', { required: true })}
          ></TextField>

          <Box sx={{ m: 2 }} />

          <TextField
            sx={{ width: '100%' }}
            label="Destination Schema"
            variant="outlined"
            {...register('destinationSchema')}
          ></TextField>

          <Box sx={{ m: 2 }} />

          <Controller
            name="sources"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <Autocomplete
                options={sources}
                onChange={(e, data) => field.onChange(data)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select source"
                    variant="outlined"
                  />
                )}
              />
            )}
          />

          <Box sx={{ m: 2 }} />

          {sourceStreams.length > 0 && (
            <>
              <div>Available Tables / Views</div>
              <ul>
                {sourceStreams.map((stream) => (
                  <li key={stream}>{stream}</li>
                ))}
              </ul>
              <div>For now we will sync all, selection coming soon</div>
            </>
          )}
        </Box>
      </>
    );
  };

  return (
    <>
      <CustomDialog
        title={'Add a new connection'}
        show={showDialog}
        handleClose={handleClose}
        handleSubmit={handleSubmit(onSubmit)}
        formContent={<CreateConnectionForm />}
        formActions={
          <>
            <Button variant="contained" type="submit">
              Connect
            </Button>
            <Button color="secondary" variant="outlined" onClick={handleClose}>
              Cancel
            </Button>
          </>
        }
      ></CustomDialog>

      <List
        openDialog={handleClickOpen}
        title="Connection"
        headers={headers}
        rows={rows}
      />
    </>
  );
};
