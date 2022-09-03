import { Action, ActionPanel, Color, getPreferenceValues, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { convertToTimeZone } from 'date-fns-timezone';
import axios from "axios";

interface Preference {
  apiKey: string | null | undefined;
}

interface ListIncidentsResponse {
  incidents: IncidentItem[];
}

interface State {
  items?: IncidentItem[];
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
        {props.item.html_url && <Action.OpenInBrowser url={props.item.html_url} />}
        {props.item.id && (
          <Action.OpenInBrowser
            url={props.item.id}
            title="Open Incident in Browser"
          />
        )}
      </ActionPanel.Section>
      <ActionPanel.Section>
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
    <List isLoading={!state.items && !state.error}>
      {state.items?.map((alert) => (
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
      // <Actions item={alert}/>
      <ActionPanel>
        <Action.OpenInBrowser url={alert.html_url}></Action.OpenInBrowser>
      </ActionPanel>
    }
    icon={{
      source: Icon.Circle,
      tintColor: {
        resolved: Color.Green,
        acknowledged: Color.Yellow,
        triggered: Color.Red,
      }[alert.status],
    }}
  ></List.Item>
);
