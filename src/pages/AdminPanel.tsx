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

const AdminPanel = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  // A palavra-passe é verificada no servidor (ADMIN_PASSWORD na VM); aqui só fica em memória.
  const fetchLeads = async (pass: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/leads', { headers: { Authorization: `Bearer ${pass}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Não foi possível carregar os leads.');
        return false;
      }
      setLeads(data.leads);
      return true;
    } catch (err) {
      console.error('Error fetching leads: ', err);
      setError('Sem ligação ao servidor.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await fetchLeads(password)) setIsAuthenticated(true);
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
                type="password"
                placeholder="Palavra-passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
      <h1 className="text-3xl font-bold mb-8">Painel de Leads</h1>
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
