import React, { useContext, useEffect, useState } from 'react';
import useSWR from 'swr';
import CustomDialog from '../Dialog/CustomDialog';
import { Autocomplete, Box, Button, TextField, Switch, Select, MenuItem } from '@mui/material';
import { Table, TableBody, TableCell, TableHead, TableRow, FormControlLabel } from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { httpGet, httpPost } from '@/helpers/http';
import { errorToast, successToast } from '../ToastMessage/ToastHelper';
import { GlobalContext } from '@/contexts/ContextProvider';
import { useSession } from 'next-auth/react';
import { backendUrl } from '@/config/constant';

interface CreateConnectionFormProps {
  mutate: (...args: any) => any;
  showForm: boolean;
  setShowForm: (...args: any) => any;
}

interface SourceStream {
  name: string;
  supportsIncremental: boolean;
  selected: boolean;
  syncMode: string; // incremental | full_refresh
  destinationSyncMode: string; // append | overwrite | append_dedup
}

const CreateConnectionForm = ({
  mutate,
  showForm,
  setShowForm,
}: CreateConnectionFormProps) => {
  const { data: session }: any = useSession();
  const { register, handleSubmit, control, watch, reset } = useForm({
    defaultValues: {
      name: '',
      sources: { label: '', id: '' },
      destinations: { label: '', id: '' },
      destinationSchema: '',
    },
  });
  const [sources, setSources] = useState<Array<string>>([]);
  const [sourceStreams, setSourceStreams] = useState<Array<SourceStream>>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [someStreamSelected, setSomeStreamSelected] = useState<boolean>(false);
  const [normalize, setNormalize] = useState<boolean>(false);

  const { data: sourcesData } = useSWR(`${backendUrl}/api/airbyte/sources`);

  const watchSourceSelection = watch('sources');

  const globalContext = useContext(GlobalContext);

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
      setLoading(true);

      (async () => {
        try {
          const message = await httpGet(
            session,
            `airbyte/sources/${watchSourceSelection.id}/schema_catalog`
          );
          const streams: SourceStream[] = [];
          message['catalog']['streams'].forEach((el: any) => {
            streams.push({
              name: el.stream.name,
              supportsIncremental: el.stream.supportedSyncModes.indexOf('incremental') > -1,
              selected: false,
              syncMode: 'full_refresh',
              destinationSyncMode: 'append',
            });
          })
          setSourceStreams(streams);
        } catch (err: any) {
          if (err.cause) {
            errorToast(err.cause.detail, [], globalContext);
          } else {
            errorToast(err.message, [], globalContext);
          }
        }
        setLoading(false);
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
    } else {
      setSourceStreams([]);
    }
  }, [watchSourceSelection]);

  const handleClose = () => {
    reset();
    setSourceStreams([]);
    setShowForm(false);
  };

  // create a new connection
  const onSubmit = async (data: any) => {
    const payload: any = {
      name: data.name,
      sourceId: data.sources.id,
      streams: sourceStreams,
      normalize: normalize,
    };
    if (data.destinationSchema) {
      payload.destinationSchema = data.destinationSchema;
    }
    try {
      await httpPost(session, 'airbyte/connections/', payload);
      mutate();
      handleClose();
      successToast('created connection', [], globalContext);
    } catch (err: any) {
      console.error(err);
      errorToast(err.message, [], globalContext);
    }
  };

  const updateThisStreamTo_ = (stream: SourceStream, newStream: SourceStream) => {
    const newstreams: SourceStream[] = [];
    for (let idx = 0; idx < sourceStreams.length; idx++) {
      if (sourceStreams[idx].name === stream.name) {
        newstreams.push(newStream);
      } else {
        newstreams.push(sourceStreams[idx]);
      }
    }
    setSourceStreams(newstreams);
    setSomeStreamSelected(newstreams.some((stream) => stream.selected));
  }
  const selectStream = (checked: boolean, stream: SourceStream) => {
    updateThisStreamTo_(stream, {
      name: stream.name,
      supportsIncremental: stream.supportsIncremental,
      selected: checked,
      syncMode: stream.syncMode,
      destinationSyncMode: stream.destinationSyncMode,
    } as SourceStream);
  };
  const setStreamIncr = (checked: boolean, stream: SourceStream) => {
    updateThisStreamTo_(stream, {
      name: stream.name,
      supportsIncremental: stream.supportsIncremental,
      selected: stream.selected,
      syncMode: checked ? 'incremental' : 'full_refresh',
      destinationSyncMode: stream.destinationSyncMode,
    } as SourceStream);
  };
  const setDestinationSyncMode = (value: string, stream: SourceStream) => {
    updateThisStreamTo_(stream, {
      name: stream.name,
      supportsIncremental: stream.supportsIncremental,
      selected: stream.selected,
      syncMode: stream.syncMode,
      destinationSyncMode: value,
    } as SourceStream);
  };

  const FormContent = () => {
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
            render={({ field }: any) => (
              <Autocomplete
                options={sources}
                value={field.value}
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

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <FormControlLabel
              control={<Switch
                checked={normalize}
                onChange={(event) => setNormalize(event.target.checked)} />
              }
              label="Normalize after sync?"
            />
          </Box>

          {sourceStreams.length > 0 && (
            <>
              <Table sx={{ minWidth: '600px' }}>
                <TableHead>
                  <TableRow>
                    <TableCell key="streamname" align='center'>
                      Stream
                    </TableCell>
                    <TableCell key="selected" align='center'>
                      Sync?
                    </TableCell>
                    <TableCell key="incremental" align='center'>
                      Incremental?
                    </TableCell>
                    <TableCell key="destsyncmode" align='center'>
                      Destination
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sourceStreams.map((stream) => (
                    <TableRow
                      key={stream.name}
                      sx={{}}>
                      <TableCell key="name" align='center' sx={stream.selected ? { color: 'green', fontWeight: 700 } : {}}>
                        {stream.name}
                      </TableCell>
                      <TableCell key="sel" align='center'>
                        <Switch
                          checked={stream.selected}
                          onChange={(event) => selectStream(event.target.checked, stream)} />
                      </TableCell>
                      <TableCell key="inc" align='center'>
                        <Switch
                          disabled={!stream.supportsIncremental || !stream.selected}
                          checked={stream.syncMode === 'incremental' && stream.selected}
                          onChange={(event) => setStreamIncr(event.target.checked, stream)} />
                      </TableCell>
                      <TableCell key="destination" align='center'>
                        <Select
                          disabled={!stream.selected}
                          value={stream.destinationSyncMode}
                          onChange={(event) => { setDestinationSyncMode(event.target.value, stream) }}>
                          <MenuItem value='append'>Append</MenuItem>
                          <MenuItem value='overwrite'>Overwrite</MenuItem>
                          <MenuItem value='append_dedup'>Append / Dedup</MenuItem>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
        show={showForm}
        handleClose={handleClose}
        handleSubmit={handleSubmit(onSubmit)}
        formContent={<FormContent />}
        formActions={
          <>
            <Button variant="contained" type="submit" disabled={!someStreamSelected}>
              Connect
            </Button>
            <Button color="secondary" variant="outlined" onClick={handleClose}>
              Cancel
            </Button>
          </>
        }
        loading={loading}
      ></CustomDialog>
    </>
  );
};

export default CreateConnectionForm;