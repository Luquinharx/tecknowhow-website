import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  interest: string;
  service?: string;
  location?: string;
  timeline?: string;
  createdAt: any;
}

const AdminPanel = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);

  // Simple password check (In a real app, use proper auth)
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Ak8cfiz!@*') { // Hardcoded password for simplicity as requested
      setIsAuthenticated(true);
      fetchLeads();
    } else {
      alert('Palavra-passe incorreta');
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const leadsData: Lead[] = [];
      querySnapshot.forEach((doc) => {
        leadsData.push({ id: doc.id, ...doc.data() } as Lead);
      });
      setLeads(leadsData);
    } catch (error) {
      console.error("Error fetching leads: ", error);
    } finally {
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
                type="password"
                placeholder="Palavra-passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" className="w-full">Entrar</Button>
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
                      {lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleString() : 'N/A'}
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
