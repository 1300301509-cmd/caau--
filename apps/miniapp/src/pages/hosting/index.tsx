import { useRouter } from '@tarojs/taro';
import { HostingApplicationPage } from '../../features/hosting/HostingApplicationPage';
import { DirectApplicationPage } from '../../features/hosting/DirectApplicationPage';

export default function Hosting() {
  const { applicationId } = useRouter().params;
  return applicationId ? (
    <HostingApplicationPage applicationId={applicationId} />
  ) : (
    <DirectApplicationPage />
  );
}
