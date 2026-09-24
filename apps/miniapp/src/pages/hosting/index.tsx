import { useRouter } from '@tarojs/taro';
import { withAgentEntry } from '../../features/agent/AgentEntry';
import { HostingApplicationPage } from '../../features/hosting/HostingApplicationPage';
import { DirectApplicationPage } from '../../features/hosting/DirectApplicationPage';

function Hosting() {
  const { applicationId } = useRouter().params;
  return applicationId ? (
    <HostingApplicationPage applicationId={applicationId} />
  ) : (
    <DirectApplicationPage />
  );
}
export default withAgentEntry(Hosting);
