import { TaskList } from '../../features/materials/TaskList';
import { withAgentEntry } from '../../features/agent/AgentEntry';

function Materials() {
  return <TaskList />;
}
export default withAgentEntry(Materials);
