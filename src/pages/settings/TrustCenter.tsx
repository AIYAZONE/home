import { Shield, Lock, Eye, FileText, Database, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Section } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const TrustCenter = () => {
  return (
    <Page className="space-y-6 lg:space-y-5">
      <PageHeader>
        <PageTitle>信任中心</PageTitle>
        <PageDescription>了解我们如何保护您的隐私和数据安全。</PageDescription>
      </PageHeader>

      <Section>
        <Section.Title>我们的隐私承诺</Section.Title>
        <Section.Description>
          我们深知家庭数据的敏感性，承诺采取一切必要措施保护您的数据安全和隐私。
        </Section.Description>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <CardTitle>数据加密</CardTitle>
              <CardDescription>您的数据在传输和存储过程中均经过加密处理</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  传输加密：使用HTTPS保护数据传输
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  存储加密：敏感数据在数据库中加密存储
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  端到端加密：特别敏感的信息采用端到端加密
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Eye className="h-5 w-5" />
              </div>
              <CardTitle>访问控制</CardTitle>
              <CardDescription>精细的权限控制确保数据只对授权人员可见</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  家庭隔离：您的家庭数据只对您的家庭成员可见
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  私密交易：支持设置交易为仅本人可见
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  角色权限：不同角色有不同的访问权限
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Database className="h-5 w-5" />
              </div>
              <CardTitle>数据控制</CardTitle>
              <CardDescription>您完全掌控自己的数据</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  数据导出：支持导出您的所有数据
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  数据删除：可以删除您的个人数据
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  账户注销：可以完全注销您的账户
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <Section.Title>隐私保护措施</Section.Title>
        <Section.Description>
          我们采取多层次的隐私保护措施，确保您的数据安全。
        </Section.Description>

        <Card>
          <CardHeader>
            <CardTitle>数据分级保护</CardTitle>
            <CardDescription>根据数据敏感度采取不同级别的保护措施</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5">P0</Badge>
                <div>
                  <h4 className="font-medium">高敏感数据</h4>
                  <p className="text-sm text-muted-foreground">包括交易金额、健康记录、家庭矛盾等非常私密的信息</p>
                  <p className="mt-1 text-sm">保护措施：端到端加密、严格访问控制、最小化存储</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5">P1</Badge>
                <div>
                  <h4 className="font-medium">敏感数据</h4>
                  <p className="text-sm text-muted-foreground">包括邮箱、姓名、家庭名称等可识别信息</p>
                  <p className="mt-1 text-sm">保护措施：传输加密、存储加密、访问控制</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5">P2</Badge>
                <div>
                  <h4 className="font-medium">低敏感数据</h4>
                  <p className="text-sm text-muted-foreground">包括主题偏好、语言设置等不涉及隐私的信息</p>
                  <p className="mt-1 text-sm">保护措施：基本加密、存储安全</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section>
        <Section.Title>安全审计与合规</Section.Title>
        <Section.Description>
          我们定期进行安全审计，确保系统符合行业标准和法规要求。
        </Section.Description>

        <Card>
          <CardHeader>
            <CardTitle>安全审计</CardTitle>
            <CardDescription>定期检查系统安全，寻找并修复漏洞</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                定期安全审计：每月进行一次系统安全检查
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                漏洞扫描：使用专业工具扫描系统漏洞
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                第三方审计：邀请独立安全专家进行审计
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>合规性</CardTitle>
            <CardDescription>遵守相关数据保护法规</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                数据保护法规：遵守 GDPR、CCPA 等数据保护法规
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                金融合规：遵守相关金融数据处理规定
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
                未成年人保护：特别保护未成年人数据
              </li>
            </ul>
          </CardContent>
        </Card>
      </Section>

      <Section>
        <Section.Title>透明与沟通</Section.Title>
        <Section.Description>
          我们致力于透明地处理您的数据，并随时解答您的疑问。
        </Section.Description>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <CardTitle>隐私政策</CardTitle>
              <CardDescription>详细说明我们如何处理您的数据</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm mb-4">
                我们的隐私政策清晰地说明了我们收集、使用、存储和保护您的数据的方式。
              </p>
              <Button variant="secondary" className="w-full">
                查看完整隐私政策
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="h-5 w-5" />
              </div>
              <CardTitle>联系我们</CardTitle>
              <CardDescription>如有任何隐私相关问题，随时联系我们</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm mb-4">
                如果您对隐私保护有任何问题或建议，我们随时为您解答。
              </p>
              <Button variant="secondary" className="w-full">
                联系隐私团队
              </Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <Section.Title>安全认证</Section.Title>
        <Section.Description>
          我们正在申请相关安全认证，以进一步确保您的数据安全。
        </Section.Description>

        <Card>
          <CardHeader>
            <CardTitle>认证状态</CardTitle>
            <CardDescription>我们正在努力获得以下认证</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">SOC 2 认证</h4>
                  <p className="text-sm text-muted-foreground">安全性、可用性、处理完整性、机密性和隐私性</p>
                </div>
                <Badge variant="warning">申请中</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">ISO 27001 认证</h4>
                  <p className="text-sm text-muted-foreground">信息安全管理体系</p>
                </div>
                <Badge variant="warning">申请中</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">GDPR 合规</h4>
                  <p className="text-sm text-muted-foreground">欧盟通用数据保护条例</p>
                </div>
                <Badge variant="success">已合规</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </Section>
    </Page>
  );
};

export default TrustCenter;