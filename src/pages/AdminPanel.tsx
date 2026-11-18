import { useState, useEffect } from 'react';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Lead {
  id: string;
  firstName: string;
  phone: string;
  interest: string;
  service?: string;
  location?: string;
  timeline?: string;
  createdAt: string;
}

const SESSION_KEY = 'tkh-admin-session';

const AdminPanel = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const logout = (message = '') => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignora */
    }
    setIsAuthenticated(false);
    setLeads([]);
    setError(message);
  };

  // As credenciais são verificadas no servidor; o browser só guarda um token de sessão (12 h).
  const fetchLeads = async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/leads', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        logout(data.error || 'Sessão expirada. Entre outra vez.');
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Não foi possível carregar os leads.');
        return;
      }
      setLeads(data.leads);
      setIsAuthenticated(true);
    } catch (err) {
      console.error('Error fetching leads: ', err);
      setError('Sem ligação ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  // retoma a sessão se a página for recarregada
  useEffect(() => {
    try {
      const token = sessionStorage.getItem(SESSION_KEY);
      if (token) fetchLeads(token);
    } catch {
      /* ignora */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Não foi possível entrar.');
        setLoading(false);
        return;
      }
      setPassword('');
      try {
        sessionStorage.setItem(SESSION_KEY, data.token);
      } catch {
        /* ignora */
      }
      await fetchLeads(data.token);
    } catch {
      setError('Sem ligação ao servidor.');
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Card className="w-[350px]">
          <CardHeader>
            <CardTitle>Acesso Administrativo</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                type="email"
                placeholder="Email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Palavra-passe"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>{loading ? 'A entrar...' : 'Entrar'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Painel de Leads</h1>
        <Button variant="outline" onClick={() => logout()}>Sair</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableCaption>Lista de contactos via WhatsApp.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telemóvel</TableHead>
                <TableHead>Interesse</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">A carregar...</TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">Nenhum registo encontrado.</TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.firstName}</TableCell>
                    <TableCell>{lead.phone}</TableCell>
                    <TableCell>
                      {lead.interest}
                      {(lead.service || lead.location || lead.timeline) && (
                        <span className="block text-xs text-muted-foreground mt-1">
                          {[lead.service, lead.location, lead.timeline].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.createdAt ? new Date(lead.createdAt).toLocaleString('pt-PT') : 'N/A'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPanel;
