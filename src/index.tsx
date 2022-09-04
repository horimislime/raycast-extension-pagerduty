import { Action, ActionPanel, Color, Form, getPreferenceValues, Icon, List, showToast, Toast } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { convertToTimeZone } from "date-fns-timezone";
import axios from "axios";

interface Preference {
  apiKey: string | null | undefined;
}

interface UpdateIncidentResponse {
  incident: IncidentItem
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

function Actions(props: { item: IncidentItem }) {
  return (
    <ActionPanel title={props.item.title}>
      <ActionPanel.Section>
        <Action.OpenInBrowser url={props.item.html_url} title="Open Incident in Browser" shortcut={{key: 'enter', modifiers: []}} />
        <Action.CopyToClipboard
          content={props.item.html_url}
          title="Copy Link"
          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        />
      </ActionPanel.Section>
      {props.item.status === "resolved" ? (
        <></>
      ) : (
        <ActionPanel.Section>
          <UpdateIncidentStatusAction item={props.item} />
        </ActionPanel.Section>
      )}
    </ActionPanel>
  );
}

function onUpdateIncidentStatus(item: IncidentItem, newStatus: IncidentStatus) {
  const preference = getPreferenceValues<Preference>();
  const [state, setState] = useState<State>({});

  useEffect(() => {
    async function updateIncident() {
      showToast(Toast.Style.Animated, 'Updating...');
      try {
        const pd = axios.create({
          baseURL: "https://api.pagerduty.com",
          headers: {
            Authorization: `Token token=${preference.apiKey}`,
          },
          params: {
            type: "incident",
            status: newStatus,
          },
        });
        const { data: response } = await pd.put<UpdateIncidentResponse>(`/incidents/${item.id}`);
        const items = state.items ?? [];
        const index = items.findIndex((i) => i.id === response.incident.id);
        items[index] = response.incident;
        setState({ items: items });
        showToast(Toast.Style.Success, `Incident #${response.incident.incident_number} has been acknowledged.`);

      } catch (error) {
        setState({
          error: error instanceof Error ? error : new Error("Something went wrong"),
        });
      }
    }

    updateIncident();
  }, []);

  if (state.error) {
    showToast(Toast.Style.Failure, state.error.message);
  }
}

function UpdateIncidentStatusAction(props: { item: IncidentItem}) {
  if (props.item.status === "resolved") {
    return <></>;
  } else if (props.item.status === "acknowledged") {
    return <Action title={"Resolve Incident"} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} onAction={() => onUpdateIncidentStatus(props.item, 'resolved')} />;
  } else {
    return (
      <>
        <Action title={"Acknowledge Incident"} shortcut={{ modifiers: ["cmd", "shift"], key: "a" }} onAction={() => onUpdateIncidentStatus(props.item, 'acknowledged')} />
        <Action title={"Resolve Incident"} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} onAction={() => onUpdateIncidentStatus(props.item, 'resolved')} />
      </>
    );
  }
}

export default function Command() {
  const preference = getPreferenceValues<Preference>();
  const [state, setState] = useState<State>({});

  const filterIncidents = useCallback(() => {
    if (state.filter === undefined || state.filter === "all") {
      return state.items;
    } else {
      return state.items?.filter((item) => item.status === state.filter);
    }
  }, [state.items, state.filter]);

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
        <IncidentListItem key={alert.id} alert={alert} />
      ))}
    </List>
  );
}

const IncidentListItem = ({ alert }: { alert: IncidentItem }) => (
  <List.Item
    title={`#${alert.incident_number}: ${alert.title}`}
    accessories={[
      {
        text: format(convertToTimeZone(parseISO(alert.created_at), { timeZone: "Asia/Tokyo" }), "yyyy/MM/dd hh:mm:ss"),
      },
    ]}
    actions={<Actions item={alert} />}
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
);
