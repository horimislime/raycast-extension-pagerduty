import { Action, ActionPanel, Color, getPreferenceValues, Icon, List, showToast, Toast } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { convertToTimeZone } from 'date-fns-timezone';
import axios from "axios";

interface Preference {
  apiKey: string | null | undefined;
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
        <Action.OpenInBrowser 
          url={props.item.html_url} 
          title="Open Incident in Browser"
        />
        {props.item.html_url && (
          <Action.CopyToClipboard
            content={props.item.html_url}
            title="Copy Link"
            shortcut={{ modifiers: ["cmd"], key: "." }}
          />
        )}
      </ActionPanel.Section>
    </ActionPanel>
  );
}

export default function Command() {
  const preference = getPreferenceValues<Preference>();
  const [state, setState] = useState<State>({});

  const filterIncidents = useCallback(() => {
    if (state.filter === undefined || state.filter === 'all') {
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
            "Authorization": `Token token=${preference.apiKey}`,
          },
          params: {
            'sort_by': 'created_at:desc'
          }
        });
        const { data: response } = await pd.get<ListIncidentsResponse>("/incidents");
        setState({items: response.incidents});
      } catch (error) {
        setState({
          error:
            error instanceof Error ? error : new Error("Something went wrong"),
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
      }>
      {filterIncidents()?.map((alert) => (
        <IncidentListItem key={alert.id} alert={alert} />
      ))}
    </List>
  );
}

const IncidentListItem = ({ alert }: { alert: IncidentItem }) => (
  <List.Item
    title={`#${alert.incident_number}: ${alert.title}`}
    accessories={[{text: format(convertToTimeZone(parseISO(alert.created_at), { timeZone: 'Asia/Tokyo'}), 'yyyy/MM/dd hh:mm:ss')}]}
    actions={
      <Actions item={alert}/>
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
);
