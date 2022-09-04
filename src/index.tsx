import {
  Action,
  ActionPanel,
  Color,
  Form,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { convertToTimeZone } from "date-fns-timezone";
import axios from "axios";
import { setTimeout } from "timers/promises";

interface Preference {
  apiKey: string | null | undefined;
}

interface UpdateIncidentResponse {
  incident: IncidentItem;
}

interface ListIncidentsResponse {
  incidents: IncidentItem[];
}

type IncidentStatus = "triggered" | "acknowledged" | "resolved";
type Filter = "all" | IncidentStatus;

interface State {
  items?: IncidentItem[];
  filter?: Filter;
  error?: Error;
}

interface IncidentItem {
  id: string;
  status: "triggered" | "acknowledged" | "resolved";
  title: string;
  summary: string;
  incident_number: number;
  created_at: string;
  urgency: "high" | "low";
  html_url: string;
}

function ResolveIcidentAction(props: { onResolve: (note: string | undefined) => void }) {
  async function handleSubmit(values: { note: string | undefined }) {
    props.onResolve(values.note);
  }
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Text} title="Resolve Incident" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="note"
        title="Resolution Note"
        placeholder="(Optional) Put some note to describe what you did to resolve this incident."
      />
    </Form>
  );
}

function UpdateIncidentStatusAction(props: {
  item: IncidentItem;
  onUpdate: (id: string, newStatus: IncidentStatus) => void;
}) {
  async function onUpdateIncidentStatus(
    item: IncidentItem,
    newStatus: IncidentStatus,
    note: string | undefined = undefined
  ) {
    const preference = getPreferenceValues<Preference>();
    showToast(Toast.Style.Animated, "Updating...");

    const requestBody = note
      ? {
          type: "incident",
          status: newStatus,
          note: note,
        }
      : {
          type: "incident",
          status: newStatus,
        };

    const pd = axios.create({
      baseURL: "https://api.pagerduty.com",
      headers: {
        Authorization: `Token token=${preference.apiKey}`,
      },
    });
    console.log(`newStatus:${newStatus} note:${note}`);
    try {
      const { data: response } = await pd.put<UpdateIncidentResponse>(`/incidents/${item.id}`, {
        incident: requestBody,
      });
      showToast(
        Toast.Style.Success,
        `Incident #${response.incident.incident_number} has been ${response.incident.status}.`
      );
      showToast(Toast.Style.Success, `Incident tested`);
      props.onUpdate(item.id, response.incident.status);
    } catch (error) {
      console.log(error);
      showToast(Toast.Style.Failure, error instanceof Error ? error.message : "Failed to update incident.");
    }
  }

  if (props.item.status === "resolved") {
    return <></>;
  } else if (props.item.status === "acknowledged") {
    return (
      <Action.Push
        key={props.item.id}
        title={"Resolve Incident"}
        shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
        target={<ResolveIcidentAction onResolve={(note) => onUpdateIncidentStatus(props.item, "resolved", note)} />}
      />
    );
  } else {
    return (
      <>
        <Action
          title={"Acknowledge Incident"}
          shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
          onAction={() => onUpdateIncidentStatus(props.item, "acknowledged")}
        />
        <Action.Push
          key={props.item.id}
          title={"Resolve Incident"}
          shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
          target={<ResolveIcidentAction onResolve={(note) => onUpdateIncidentStatus(props.item, "resolved", note)} />}
        />
      </>
    );
  }
}

export default function Command() {
  const preference = getPreferenceValues<Preference>();
  const [state, setState] = useState<State>({});
  const { pop } = useNavigation();

  const filterIncidents = useCallback(() => {
    if (state.filter === undefined || state.filter === "all") {
      return state.items;
    } else {
      return state.items?.filter((item) => item.status === state.filter);
    }
  }, [state.items, state.filter]);

  async function updateIncident(id: string, newStatus: IncidentStatus) {
    const items = state.items ?? [];
    const index = items.findIndex((i) => i.id === id);
    if (index < 0) {
      showToast(Toast.Style.Failure, "Failed to update incident status.");
      return;
    }

    items[index].status = newStatus;
    setState({ items: items });

    await setTimeout(600);
    pop();
  }

  useEffect(() => {
    async function fetchIncidents() {
      try {
        const pd = axios.create({
          baseURL: "https://api.pagerduty.com",
          headers: {
            Authorization: `Token token=${preference.apiKey}`,
          },
          params: {
            sort_by: "created_at:desc",
          },
        });
        const { data: response } = await pd.get<ListIncidentsResponse>("/incidents");
        setState({ items: response.incidents });
      } catch (error) {
        setState({
          error: error instanceof Error ? error : new Error("Something went wrong"),
        });
      }
    }

    fetchIncidents();
  }, []);

  if (state.error) {
    showToast(Toast.Style.Failure, state.error.message);
  }

  return (
    <List
      isLoading={!state.items && !state.error}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter incidents by status"
          value={state.filter}
          onChange={(newValue) => setState((previous) => ({ ...previous, filter: newValue as Filter }))}
        >
          <List.Dropdown.Item title="All" value={"all"} />
          <List.Dropdown.Item title="Triggered" value={"triggered"} />
          <List.Dropdown.Item title="Acknowledged" value={"acknowledged"} />
          <List.Dropdown.Item title="Resolved" value={"resolved"} />
        </List.Dropdown>
      }
    >
      {filterIncidents()?.map((alert) => (
        <List.Item
          key={alert.id}
          title={`#${alert.incident_number}: ${alert.title}`}
          accessories={[
            {
              text: format(
                convertToTimeZone(parseISO(alert.created_at), { timeZone: "Asia/Tokyo" }),
                "yyyy/MM/dd hh:mm:ss"
              ),
            },
          ]}
          actions={
            <ActionPanel title={alert.title}>
              <ActionPanel.Section>
                <Action.OpenInBrowser
                  url={alert.html_url}
                  title="Open Incident in Browser"
                  shortcut={{ key: "enter", modifiers: [] }}
                />
                <Action.CopyToClipboard
                  content={alert.html_url}
                  title="Copy Link"
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                />
              </ActionPanel.Section>
              {alert.status === "resolved" ? (
                <></>
              ) : (
                <ActionPanel.Section>
                  <UpdateIncidentStatusAction item={alert} onUpdate={updateIncident} />
                </ActionPanel.Section>
              )}
            </ActionPanel>
          }
          icon={{
            source: {
              resolved: Icon.CheckCircle,
              acknowledged: Icon.Alarm,
              triggered: Icon.AlarmRinging,
            }[alert.status],
            tintColor: {
              resolved: Color.Green,
              acknowledged: Color.Yellow,
              triggered: Color.Red,
            }[alert.status],
          }}
        ></List.Item>
      ))}
    </List>
  );
}
