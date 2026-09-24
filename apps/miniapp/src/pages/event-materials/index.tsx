import { HostingApplicationPage } from '../../features/hosting/HostingApplicationPage';
import { withAgentEntry } from '../../features/agent/AgentEntry';
function EventMaterials() {
  return <HostingApplicationPage materials />;
}
export default withAgentEntry(EventMaterials);
