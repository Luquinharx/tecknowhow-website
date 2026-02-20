import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MessageCircle, X, Send, User, ChevronDown } from "lucide-react";

// Removido lastName
const formSchema = z.object({
  firstName: z.string().min(2, "Nome é obrigatório"),
  phone: z.string().min(9, "Telemóvel inválido"),
  interest: z.string().min(5, "Por favor, descreva o seu interesse"),
});

type FormData = z.infer<typeof formSchema>;

const WhatsAppChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"welcome" | "form" | "success" | "error">("welcome");
  const [errorMessage, setErrorMessage] = useState("");
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const q = query(collection(db, "leads"), where("phone", "==", data.phone));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        setStep("error");
        setErrorMessage("Identificámos que este telemóvel já se encontra registado no nosso sistema 😊 Em instantes um assistente continuará o seu atendimento.");
      } else {
        await addDoc(collection(db, "leads"), {
          firstName: data.firstName,
          phone: data.phone,
          interest: data.interest,
          createdAt: serverTimestamp(),
        });

        setStep("success");
        
        setTimeout(() => {
          const message = `Olá, o meu nome é ${data.firstName}.\nTelemóvel: ${data.phone}\nTenho interesse em: ${data.interest}`;
          const url = `https://wa.me/351913503036?text=${encodeURIComponent(message)}`;
          window.open(url, "_blank");
        }, 2000);
      }
    } catch (e) {
      console.error(e);
      setErrorMessage("Ocorreu um erro. Tente novamente.");
      setStep("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleChat = () => setIsOpen(!isOpen);

  return (
    <div className="fixed bottom-0 right-4 z-50 flex flex-col items-end font-sans">
      {isOpen && (
        <div className="w-[350px] max-w-[90vw] h-[650px] max-h-[85vh] bg-white rounded-t-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 fade-in duration-300 border border-t border-l border-r border-gray-100 mb-0 relative z-10 transition-all">
          
          <div className="bg-primary p-4 flex items-center justify-between text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border-2 border-white/30">
                   <img 
                     src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100&h=100" 
                     alt="Assistente" 
                     className="w-full h-full object-cover"
                   />
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-primary rounded-full"></span>
              </div>
              <div>
                <p className="font-semibold text-sm">Atendimento Especializado</p>
                <p className="text-xs text-primary-foreground/80">Online agora</p>
              </div>
            </div>
            <button onClick={toggleChat} className="text-white/80 hover:text-white transition-colors">
              <ChevronDown size={20} />
            </button>
          </div>

          <div className="flex-1 bg-gray-50 p-4 overflow-y-auto flex flex-col gap-4">
            
            <div className="flex gap-2 items-end">
               <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mb-1">
                 <img 
                   src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100&h=100" 
                   alt="Assistente" 
                   className="w-full h-full object-cover"
                 />
               </div>
               <div className="bg-white p-3 rounded-2xl rounded-bl-none shadow-sm border border-gray-100 text-sm text-gray-700 max-w-[85%]">
                 <p>Bom dia! 😊 Seja bem-vindo(a). Para o(a) encaminharmos, por favor preencha as informações abaixo.</p>
               </div>
            </div>

            {step === 'error' && (
               <div className="flex gap-2 items-end animate-in fade-in zoom-in duration-300">
                  <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mb-1">
                    <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100&h=100" className="w-full h-full object-cover" />
                  </div>
                  <div className="bg-red-50 p-3 rounded-2xl rounded-bl-none shadow-sm border border-red-100 text-sm text-red-700 max-w-[85%]">
                    <p>{errorMessage}</p>
                  </div>
               </div>
            )}

            {step === 'success' && (
               <div className="flex gap-2 items-end animate-in fade-in zoom-in duration-300">
                  <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mb-1">
                    <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100&h=100" className="w-full h-full object-cover" />
                  </div>
                  <div className="bg-green-50 p-3 rounded-2xl rounded-bl-none shadow-sm border border-green-100 text-sm text-green-700 max-w-[85%]">
                    <p>Perfeito! Já o(a) estou a encaminhar para um dos nossos especialistas.</p>
                  </div>
               </div>
            )}

            {(step === 'welcome' || step === 'form') && (
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3 mt-2 animate-in slide-in-from-bottom-2 duration-500 delay-150 fill-mode-forwards pb-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
                  <div className="space-y-1">
                     <label className="text-xs font-medium text-gray-500 ml-1">O seu nome</label>
                     <Input 
                       {...form.register("firstName")}
                       placeholder="Nome"
                       className="bg-gray-50 border-0 focus-visible:ring-1 focus-visible:ring-primary/20 h-9"
                     />
                     {form.formState.errors.firstName && <p className="text-[10px] text-red-500 ml-1">{form.formState.errors.firstName.message}</p>}
                  </div>

                  <div className="space-y-1">
                     <label className="text-xs font-medium text-gray-500 ml-1">O seu Telemóvel</label>
                     <Input 
                       {...form.register("phone")}
                       placeholder="XXX XXX XXX"
                        className="bg-gray-50 border-0 focus-visible:ring-1 focus-visible:ring-primary/20 h-9"
                     />
                      {form.formState.errors.phone && <p className="text-[10px] text-red-500 ml-1">{form.formState.errors.phone.message}</p>}
                  </div>

                   <div className="space-y-1 pt-2">
                     <label className="text-xs font-bold text-primary ml-1 block">
                       Sobre o que precisa de ajuda?
                       <span className="text-[10px] font-normal text-muted-foreground block mt-0.5 mb-1 leading-tight">
                         Descreva com atenção. Esta informação é fundamental para o(a) encaminharmos ao especialista correto.
                       </span>
                     </label>
                     <Textarea 
                       {...form.register("interest")}
                       placeholder="Escreva aqui..."
                       className="bg-gray-50 border-0 focus-visible:ring-1 focus-visible:ring-primary/20 resize-none min-h-[80px] text-sm"
                     />
                      {form.formState.errors.interest && <p className="text-[10px] text-red-500 ml-1">{form.formState.errors.interest.message}</p>}
                  </div>

                  <Button type="submit" disabled={isSubmitting} className="w-full mt-2 h-10 text-sm font-medium shadow-none">
                    {isSubmitting ? "A enviar..." : "Iniciar conversa"}
                    {!isSubmitting && <Send size={14} className="ml-2" />}
                  </Button>
                </div>
              </form>
            )}
           </div>

           <div className="bg-white p-3 text-center border-t border-gray-100 shrink-0">
             <p className="text-[10px] text-gray-400">TecKnowHow &bull; Atendimento Online</p>
           </div>
        </div>
      )}

      <button 
        onClick={toggleChat}
        className={`${isOpen ? 'scale-0 opacity-0 mb-0' : 'scale-100 opacity-100 mb-6'} transition-all duration-300 w-14 h-14 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 z-50 group absolute right-0 bottom-0`}
        aria-label="Chat com especialista"
      >
        <MessageCircle size={32} className="group-hover:rotate-12 transition-transform duration-300" />
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center animate-bounce border-2 border-white">
          1
        </span>
      </button>
    </div>
  );
}

export default WhatsAppChat;
