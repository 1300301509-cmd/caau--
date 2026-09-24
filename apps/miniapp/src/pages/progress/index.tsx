import { TaskList } from '../../features/materials/TaskList';
import { withAgentEntry } from '../../features/agent/AgentEntry';

function Progress() {
  return <TaskList mode="progress" />;
}
export default withAgentEntry(Progress);
