import { analyzeReport, analyzeVolunteers } from './gemini';
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { db } from './firebase'; 
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from "firebase/firestore";
import { MessageCircle} from 'lucide-react';
import { MessageSquare, X, Send } from 'lucide-react'; // If you don't have lucide-react, install it or use SVG
function App() {
  
  // --- AUTH & VIEW STATES ---
  
  const [selectedVolunteerChat, setSelectedVolunteerChat] = useState("Volunteer");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [lastProcessedMsgId, setLastProcessedMsgId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null); // 'admin' or 'volunteer'
  const [currentUser, setCurrentUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [volPass, setVolPass] = useState({});
  const [respondents, setRespondents] = useState([]);
  const [lockedTasks, setLockedTasks] = useState({}); // Stores { taskId: volunteerName }
  // --- YOUR EXACT ORIGINAL STATES ---
  const [assigned, setAssigned] = useState({});
  const [data, setData] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [volunteers, setVolunteers] = useState([]); 
  const [taskStatus, setTaskStatus] = useState({}); 
  const [selectedCategory, setSelectedCategory] = useState(null); 
  const [selectedState, setSelectedState] = useState(null); 
  const taskActionMap = {
    "Sanitation": "Provide Sanitation Kit",
    "Employment": "Job Portal Registration",
    "Poverty": "Direct Benefit Transfer (DBT)",
    "Healthcare": "Medical Consultation & Kit",
    "Water": "Clean Water Supply Logistics"
  };
  useEffect(() => {
    // 1. Ensure the collection name is EXACTLY "chats"
    const q = query(collection(db, "chats"), orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          // Fallback so the app doesn't crash if timestamp is null for a split second
          timestamp: data.timestamp || { toDate: () => new Date() } 
        };
      });
      console.log("Messages received from Firebase:", msgs); // <--- ADD THIS
      if (msgs.length > 0) {
        const latestMsg = msgs[msgs.length - 1];
        const myName = userRole === 'admin' ? "Admin" : currentUser?.name;
        console.log("My Name:", myName);
        console.log("Sender Name:", latestMsg.senderId);
        console.log("Is External?:", latestMsg.senderId !== myName);
        console.log("Is Chat Open?:", isChatOpen);

        const isOtherPerson = latestMsg.senderId !== myName;

        // If chat is CLOSED and someone else sent a message -> Show Dot
        if (!isChatOpen && isOtherPerson) {
          setHasNewMessage(true);
        }
        
        // If chat is OPEN -> Hide Dot
        if (isChatOpen) {
          setHasNewMessage(false);
        }
      }
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [isChatOpen, lastProcessedMsgId, userRole, currentUser?.name]);
  // Added currentUser?.name specifically to the dependency array
  useEffect(() => {
    // We use messages[messages.length - 1] directly here to be safe
    if (messages.length > 0) {
      setLastProcessedMsgId(messages[messages.length - 1].id);
      setHasNewMessage(false);
    }
  }, [userRole]);
// --- ADD THIS AFTER THE USEEFFECT ---
const sendMessage = async () => {
  if (!newMessageText.trim()) return;

  const myName = userRole === 'admin' ? "Admin" : (currentUser?.name || "Volunteer");

  try {
    // We're using a plain JS date first to see if it fixes the "ghost" issue
    await addDoc(collection(db, "chats"), {
      text: newMessageText,
      senderId: myName,
      timestamp: serverTimestamp(), 
    });

    setNewMessageText(""); // This clears the box
    console.log("SUCCESS: Message sent to 'chats' collection");

  } catch (error) {
    console.error("FIREBASE ERROR:", error.message);
    alert("Check console: " + error.message); // This will pop up if it fails
  }
};

  // --- YOUR EXACT ORIGINAL FUNCTIONS ---
  const handleAssign = (vol) => {
    setAssigned(prev => ({ ...prev, [vol.name]: true }));
    setTaskStatus(prev => ({ ...prev, [vol.name]: selectedState.stateName }));
    alert(`⚡ DEPLOYMENT ALERT\nVolunteer: ${vol.name}\nRegion: ${selectedState.stateName}`);
  };
  // --- FUNCTION TO HANDLE TASK COMPLETION ---
  const handleTaskComplete = (respondentId) => {
    setRespondents(prev => prev.map(res => 
      res.id === respondentId ? { ...res, completed: true } : res
    ));
  };
  const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  setLoading(true);
  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64Data = reader.result.split(',')[1];
    const imagePart = { inlineData: { data: base64Data, mimeType: file.type } };
    try {
      const response = await analyzeReport(imagePart);
      setData(response);
      
      // Flatten all respondents from all states into one global list for the volunteers
      const allRespondents = response.states.flatMap(state => 
        state.respondents.map(r => ({
          ...r,
          region: state.stateName, // Critical for filtering!
          completed: false
        }))
      );
      setRespondents(allRespondents);
    } catch (error) { console.error("Crisis Upload Error", error); }
    setLoading(false);
  };
  reader.readAsDataURL(file);
};

  const handleVolunteerUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  setLoading(true);
  
  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64Data = reader.result.split(',')[1];
    const filePart = { inlineData: { data: base64Data, mimeType: file.type } };
    try {
      const response = await analyzeVolunteers(filePart);
      const rawList = Array.isArray(response) ? response : (response.volunteers || []);

      const cleanedVolunteers = rawList.map(v => {
        // Extract phone number from the sheet column 'Phone_Number'
        const rawPhone = v.Phone_Number || v.phone || v.PhoneNumber || "";
        
        return {
          ...v,
          // Store a cleaned version (numbers only) for the login check
          loginPhone: String(rawPhone).replace(/\D/g, '') || "9876543210"
        };
      });

      setVolunteers(cleanedVolunteers);
    } catch (error) {
      console.error("Volunteer Upload Error", error);
    }
    setLoading(false);
  };
  reader.readAsDataURL(file);
};

  const categorizedStates = {
    red: data?.states?.filter(s => parseFloat(s.totalUrgency) >= 8) || [],
    yellow: data?.states?.filter(s => {
      const score = parseFloat(s.totalUrgency);
      return score >= 5 && score < 8;
    }) || [],
    green: data?.states?.filter(s => parseFloat(s.totalUrgency) < 5) || []
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const state = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs border border-slate-700">
          <p className="font-bold border-b border-slate-700 mb-1 text-blue-400">{state.stateName}</p>
          {state.problemCounts && Object.entries(state.problemCounts).map(([prob, count]) => (
            <p key={prob}>{prob}: <span className="font-bold text-amber-400">{count}</span></p>
          ))}
        </div>
      );
    }
    return null;
  };

  // --- NEW LOGIN PAGE VIEW ---
  if (!isLoggedIn) {
    return (
      
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="bg-pink-100 p-10 rounded-3xl shadow-2xl w-full max-w-md border border-red-900">
          <div className="text-center mb-8">
             <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">resq-ai Portal</h1>
          </div>
          
          <div className="space-y-6">
            {/* ADMIN SECTION */}
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-400">
                <p className="text-[10px] font-black text-blue-600 mb-2 text-center">ADMIN PASSWORD( FOR DEMO ): <span className="underline">admin123</span></p>
                <div className="flex gap-2">
                    <input 
                        type="password" 
                        placeholder="Use admin123" 
                        className="flex-1 p-3 rounded-xl border border-blue-200 text-sm outline-none focus:ring-2 ring-blue-400"
                        onChange={(e) => setAdminPass(e.target.value)}
                        
                    />
                    <button 
                      onClick={() => {
                        // .trim() removes any accidental spaces
                        // .toLowerCase() ensures "Admin123" or "ADMIN123" still works
                        if (adminPass.trim().toLowerCase() === "admin123") {
                            setIsLoggedIn(true);
                            setUserRole('admin');
                        } else {
                            alert("Use: admin123");
                        }
                      }}
                      className="bg-blue-600 text-white px-5 py-2 rounded-xl font-black text-xs uppercase hover:bg-blue-700 transition-colors"
                    >
                        Enter
                    </button>
                </div>
            </div>

            <div className="relative flex justify-center text-[14px] uppercase font-black text-slate-800">
                <span className="bg-pink-100 px-5 text-slate-700">Volunteer Search</span>
            </div>

            {/* VOLUNTEER SECTION */}
            <div className="space-y-3">
                <input 
                    type="text" 
                    placeholder="Search your name..." 
                    className="w-full p-3 bg-slate-50 border border-slate-800 rounded-xl text-sm outline-none focus:ring-2 ring-blue-500"
                    onChange={(e) => setSearchQuery(e.target.value)}
                />

               <div className="max-h-52 overflow-y-auto space-y-2 pr-2">
                {volunteers.length > 0 ? (
                  volunteers
                    .filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((v) => {
                      // Find the ID by checking any key that looks like 'id' or 'phone'
                      const keys = Object.keys(v);
                      const idKey = keys.find(k => k.toLowerCase().includes('id') || k.toLowerCase().includes('phone'));
                      const actualID = v.id || v.ID || v.volunteerID || (idKey ? v[idKey] : "N/A");

                      return (
                        <div key={v.name} className="p-3 border border-slate-100 rounded-xl bg-white shadow-sm mb-2">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-xs font-black text-slate-700">{v.name}</p>
                            <p className="text-[9px] text-slate-500 font-bold italic">ID shown for demo use: {actualID}</p>
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="password" 
                              placeholder="Login with phone number" 
                              className="flex-1 p-2 text-[10px] bg-slate-50 border rounded-lg"
                              onChange={(e) => setVolPass({ ...volPass, [v.name]: e.target.value })}
                            />
                            <button 
                              onClick={() => {
                                const entered = String(volPass[v.name] || "").trim();
                                const target = String(actualID).trim();
                                
                                // If they match, OR if you are in a hurry for the demo, 
                                // you can add '|| entered === "123"' just for testing
                                if (entered === target && target !== "N/A") {
                                  setCurrentUser(v);
                                  setUserRole('volunteer');
                                  setIsLoggedIn(true);
                                } else {
                                  alert(`Login Error! Use the ID shown above: ${target}`);
                                }
                              }}
                              className="bg-slate-800 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase"
                            >
                              Login
                            </button>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="text-center py-4">
                    <p className="text-[10px] font-bold text-slate-300 italic uppercase">No Roster Detected</p>
                  </div>
                )}
              </div>
              </div> 
            </div>
          </div>
        </div>
    );
    
  }
// --- ADD THIS RIGHT BEFORE "if (userRole === 'volunteer')" ---

// --- VOLUNTEER DASHBOARD VIEW ---
if (userRole === 'volunteer') {
  const myRegion = taskStatus[currentUser.name];
  
  // Logic calculations
  const myTasks = respondents.filter(r => r.region === myRegion && !r.completed);
  const completedCount = respondents.filter(r => r.region === myRegion && r.completed).length;
  const totalInRegion = respondents.filter(r => r.region === myRegion).length;
  const progress = totalInRegion > 0 ? Math.round((completedCount / totalInRegion) * 100) : 0;

  const handleToggleLock = (taskId) => {
    setLockedTasks(prev => {
      if (prev[taskId] === currentUser.name) {
        const newLocks = { ...prev };
        delete newLocks[taskId];
        return newLocks;
      }
      return { ...prev, [taskId]: currentUser.name };
    });
  };

  return (
    <div className="min-h-screen bg-pink-100 font-sans pb-10">
      {/* NAVIGATION */}
      <nav className="bg-slate-900 border-b border-slate-600 p-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <h1 className="font-black text-blue-200  italic text-xl">RESQ-AI Volunteer Dashboard</h1>
        <button 
          onClick={() => setIsLoggedIn(false)} 
          className="text-[15px] font-black uppercase text-red-600 bg-red-100 px-10 py-2 rounded-full border border-red-700"
        >
          Logout
        </button>
      </nav>

      <main className="p-4 max-w-6xl mx-auto">
        {/* PROGRESS SECTION */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-600 mb-6">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-blue-600 text-[10px] font-black uppercase tracking-widest mb-1">Assigned Field Unit</p>
              <h2 className="text-2xl font-black text-slate-900">{currentUser.name}</h2>
              <p className="text-slate-600 text-xs font-bold mt-1">📍 Sector: {myRegion || "Pending Assignment"}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase">Region Resolution</p>
              <p className="text-3xl font-black text-blue-600">{progress}%</p>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200">
            <div 
              className="bg-blue-600 h-full transition-all duration-1000 ease-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* MAIN CONTENT GRID */}
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: TASK LIST */}
          <div className="lg:col-span-1 space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase mb-4 tracking-widest px-2">Live Task Queue</h3>
            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3">
              
              {/* SUCCESS PART: Check if there are any tasks left */}
              {myTasks.length > 0 ? (
                myTasks.map((res) => {
                  const lockedBy = lockedTasks[res.id];
                  const isLockedByMe = lockedBy === currentUser.name;
                  const isLockedByOther = lockedBy && lockedBy !== currentUser.name;

                  return (
                    <div 
                      key={res.id} 
                      onClick={() => !isLockedByOther && setSelectedTask(res)}
                      className={`relative p-5 rounded-2xl border-2 transition-all ${
                        selectedTask?.id === res.id ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-300 bg-white'
                      } ${isLockedByOther ? 'opacity-60 bg-slate-100 cursor-not-allowed' : 'hover:border-blue-400 cursor-pointer'}`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase">
                          {res.problem}
                        </span>
                        
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleToggleLock(res.id); }}
                          className="flex flex-col items-center group"
                        >
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            viewBox="0 0 24 24" 
                            fill={isLockedByMe ? "#f59e0b" : "none"} 
                            stroke={isLockedByMe ? "#f59e0b" : "#cbd5e1"} 
                            className="w-6 h-6 transition-transform group-hover:scale-110"
                            strokeWidth="2"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                          </svg>
                          <span className={`text-[12px] font-black uppercase mt-1 ${isLockedByMe ? 'text-amber-600' : 'text-slate-900'}`}>
                            {isLockedByMe ? 'Working' : 'Claim'}
                          </span>
                        </button>
                      </div>

                      <h4 className="font-black text-slate-900 text-lg mt-2">
                        {/* Using your task map here */}
                        {taskActionMap[res.problem] || res.problem || "Active Task"}
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {res.name || res.Name || `Case #${res.id}`}
                      </p>
                    </div>
                  );
                })
              ) : (
                /* THIS IS THE SUCCESS PART THAT SHOWS AT 100% */
                <div className="p-10 text-center bg-blue-50 border-2 border-dashed border-blue-200 rounded-[40px] animate-in fade-in zoom-in-95">
                  <div className="text-5xl mb-4">🏆</div>
                  <h3 className="font-black text-blue-900 uppercase text-sm tracking-widest">Queue Clear</h3>
                  <p className="text-blue-600 text-[10px] font-bold mt-2 uppercase">All residents in this sector have been assisted.</p>
                </div>
              )}

            </div>
          </div>

          {/* RIGHT COLUMN: DETAIL VIEW */}
          <div className="lg:col-span-2">
            {myTasks.length > 0 ? (
              selectedTask ? (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-in slide-in-from-right-4">
                  {/* Header Section */}
                  <div className="bg-slate-900 p-5 text-white flex justify-between items-center">
                    <div>
                      <h3 className="font-black uppercase text-[10px] tracking-widest opacity-70">Field Record</h3>
                      <h2 className="text-xl font-black">
                        {taskActionMap[selectedTask.problem] || selectedTask.problem || "Active Task"}
                      </h2>
                    </div>
                    <button 
                      onClick={() => handleTaskComplete(selectedTask.id)} 
                      className="bg-green-700 hover:bg-green-900 px-6 py-2 rounded-xl text-xs font-black uppercase transition-colors shadow-lg"
                    >
                      Mark Resolved
                    </button>
                  </div>

                  {/* Content Section */}
                  <div className="p-8">
                    <table className="w-full text-left mb-8 border-separate border-spacing-y-2">
                      <thead>
                        <tr className="text-slate-700 text-[10px] font-black uppercase tracking-widest">
                          <th className="pb-2">Attribute</th>
                          <th className="pb-2">Details</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        
                        <tr className="bg-slate-50 rounded-lg">
                          <td className="p-4 font-bold text-slate-700 uppercase text-[10px]">Case ID</td>
                          <td className="p-4 font-mono font-black text-blue-700">{selectedTask.id}</td>
                        </tr>
                        <tr>
                          <td className="p-4 font-bold text-slate-700 uppercase text-[10px]">Primary Crisis</td>
                          <td className="p-4 font-black text-red-600">{selectedTask.problem}</td>
                        </tr>
                        <tr className="bg-slate-50 rounded-lg">
                          <td className="p-4 font-bold text-slate-600 uppercase text-[10px]">Family Size</td>
                          <td className="p-4 font-bold text-slate-900">{selectedTask.familySize} Members</td>
                        </tr>
                      </tbody>
                    </table>
                    
                    {/* Chat/Alert Area */}
                    <div className="mt-6 border-t pt-6">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-3">Ask Help</p>
                      <div className="flex gap-2">
                        <input type="text" placeholder="Need extra supplies?..." className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium outline-none focus:ring-2 ring-blue-500 transition-all" />
                        <button className="bg-slate-700 text-white px-8 py-2 rounded-2xl text-[12px] font-black uppercase hover:bg-blue-600 transition-all shadow-lg">Send Alert</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Fallback when tasks exist but none are clicked */
                <div className="h-[60vh] flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[40px] bg-slate-50/50">
                  <p className="text-slate-500 font-black uppercase text-xs tracking-widest">Select a Case to Begin Work</p>
                </div>
              )
            ) : (
              /* FINAL SUCCESS STATE: Shows when myTasks is empty (100% completion) */
              <div className="h-[60vh] flex flex-col items-center justify-center bg-slate-900 rounded-[40px] text-center p-10 shadow-2xl animate-in fade-in duration-700">
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,197,94,0.4)]">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="white" className="w-10 h-10">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Mission Accomplished</h2>
                <p className="text-slate-400 font-bold mt-2 text-sm uppercase tracking-widest">All Priority Tasks for this Sector are Resolved</p>
                <div className="mt-8 px-6 py-2 bg-slate-600 rounded-full border border-slate-500">
                <span className="text-[10px] font-black uppercase text-white tracking-widest">Community Needs : Fully Addressed</span>  
                </div>
              </div>
            )}
          </div>

        </div> {/* End of Grid */}
      </main>
      {/* --- CHAT OVERLAY --- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        
        {/* 1. THE FLOATING BUTTON */}
        <button 
          onClick={() => {
            setIsChatOpen(!isChatOpen);
            if (!isChatOpen) {
              // When opening, clear the dot and mark the latest as 'seen'
              setHasNewMessage(false); 
              if (messages.length > 0) {
                setLastProcessedMsgId(messages[messages.length - 1].id);
              }
            }
          }}
          className="relative"
        >
          <MessageCircle size={24} />
          {hasNewMessage && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
          )}
        </button>

        {/* 2. THE CHAT WINDOW (Only shows if isChatOpen is true) */}
        {isChatOpen && (
          <div className="absolute bottom-20 right-0 w-80 h-112.5 bg-blue-600 rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            
            {/* Header */}
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <span className="text-xs font-black tracking-widest uppercase">Support Chat</span>
              <button onClick={() => setIsChatOpen(false)}><X size={18} /></button>
            </div>

            {/* Messages List (This is the part you already had) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {messages.map((m) => {
                const isMe = m.senderId === (userRole === 'admin' ? "Admin" : currentUser?.name);
                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] font-black uppercase text-slate-400 mb-1 px-1">{m.senderId}</span>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-xs font-bold ${
                      m.senderId === "Admin" ? 'bg-slate-900 text-white' : isMe ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 shadow-sm border'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Area - Place this right before the last </div> of the chat window */}
            <div className="p-3 bg-white border-t flex gap-2">
              <input 
                type="text"
                value={newMessageText} // CRITICAL: This links the box to your state
                onChange={(e) => setNewMessageText(e.target.value)} // Updates state as you type
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); // Prevents page reload
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 bg-slate-100 p-2 rounded-xl text-xs outline-none text-slate-900"
              />
              <button 
                onClick={sendMessage} 
                className="text-blue-600 hover:scale-110 transition-transform"
              >
                <Send size={20}/>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
      
  


  // --- YOUR ORIGINAL ADMIN DASHBOARD RENDER ---
  
  return (
    <div className="min-h-screen bg-amber-100 font-sans text-gray-900 pb-10">
      <nav className="bg-slate-800 p-4 text-white shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold italic">RESQ-AI Administration</h1>
          <div className="flex items-center gap-12">
             <div className="flex flex-col items-end">
                <span className="text-[15px] font-black uppercase tracking-widest opacity-80">Volunteer Sheet</span>
                <input type="file" onChange={handleVolunteerUpload} className="text-[12px] w-40 cursor-pointer file:rounded file:border-0 file:bg-yellow-900 file:text-white file:px-2" />
             </div>
             <button onClick={() => setIsLoggedIn(false)} className="bg-red-600 px-3 py-2 rounded-full text-sm font-bold">LOGOUT</button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto p-6">
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* SECTION 1: AI UPLOAD & CATEGORY BOXES */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-500">
            <h2 className="text-xl font-bold mb-2 text-blue-900 flex items-center">
              <span className="mr-2">1.</span> AI Data Extraction
            </h2>
            <p className="text-sm text-gray-600 mb-4">Upload report photos to categorize regional urgency.</p>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
            
            {loading && <p className="mt-4 text-blue-600 animate-pulse font-bold text-center italic">AI is processing field documents...</p>}
            
            {data && (
              <div className="mt-6 grid grid-cols-1 gap-3">
                {[
                  { id: 'red', label: 'CRITICAL', range: '(8-10)', bg: 'bg-red-500', data: categorizedStates.red },
                  { id: 'yellow', label: 'MODERATE', range: '(5-7)', bg: 'bg-amber-500', data: categorizedStates.yellow },
                  { id: 'green', label: 'STABLE', range: '(1-4)', bg: 'bg-green-500', data: categorizedStates.green }
                ].map(box => (
                  <div 
                    key={box.id}
                    onClick={() => {setSelectedCategory(box.id); setSelectedState(null)}} 
                    className={`cursor-pointer p-4 rounded-xl text-white transition-all shadow-md ${box.bg} ${selectedCategory === box.id ? 'ring-4 ring-blue-400 scale-[1.02]' : 'opacity-90 hover:opacity-100'}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-black tracking-widest">{box.label} {box.range}</p>
                      <p className="text-2xl font-black">{box.data.length}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {box.data.length > 0 ? box.data.map(s => (
                        <span key={s.stateName} className="bg-black/20 px-2 py-0.5 rounded text-[10px] font-bold">
                          {s.stateName} ({s.totalUrgency})
                        </span>
                      )) : <span className="text-[10px] italic opacity-70">No states in this range</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2: REGIONAL BAR CHART */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-500">
            <h2 className="text-xl font-bold mb-2 text-blue-900 flex items-center">
              <span className="mr-2">2.</span> Urgency Graph
            </h2>
            <div className="h-64 w-full bg-gray-50 rounded-lg p-2 mt-4">
              {!selectedCategory ? (
                <div className="h-full flex items-center justify-center text-gray-400 text-xs italic text-center">
                  Select a priority box on the left <br/> to visualize the statistics.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categorizedStates[selectedCategory]}>
                    <XAxis dataKey="stateName" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} hide />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                    <Bar dataKey="totalUrgency" radius={[6, 6, 0, 0]} onClick={(v) => setSelectedState(v.payload)}>
                      {categorizedStates[selectedCategory].map((entry, index) => (
                        <Cell key={index} cursor="pointer" fill={selectedState?.stateName === entry.stateName ? '#2563eb' : '#cbd5e1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3: RESPONDENT DETAILS */}
        {selectedState && (
          <div className="mt-8 bg-white p-6 rounded-xl shadow-xl border-t-4 border-blue-600 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-blue-800 uppercase tracking-tight">
                Crisis Records: {selectedState.stateName}
              </h2>
              <span className="text-xs font-bold bg-red-100 text-red-700 px-3 py-1 rounded-full border border-red-200 uppercase">
                Urgency Score: {selectedState.totalUrgency}/10
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-400 uppercase text-[10px] font-black tracking-widest">
                    <th className="pb-3">ID</th>
                    <th className="pb-3">Profile</th>
                    <th className="pb-3">Primary Issue</th>
                    <th className="pb-3 text-center">HH Size</th>
                    <th className="pb-3">Income Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedState.respondents.map(person => (
                    <tr key={person.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="py-4 font-mono font-bold text-blue-700">{person.id}</td>
                      <td className="py-4 font-medium">{person.age}y / {person.gender}</td>
                      <td className="py-4">
                        <span className="bg-red-50 text-red-600 px-2 py-1 rounded text-[10px] font-black border border-red-100 uppercase">
                          {person.problem}
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded font-bold text-xs italic">
                          {person.familySize} Members
                        </span>
                      </td>
                      <td className="py-4 font-bold text-slate-500 uppercase text-[10px]">{person.income}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 4: VOLUNTEER MATCHING */}
        <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-blue-500">
          <h2 className="text-xl font-bold mb-4 flex items-center text-blue-900">
            <span className="mr-2">3.</span> Volunteer Matching System
          </h2>
          <div className="overflow-x-auto">
            {volunteers.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-gray-100 rounded-2xl text-gray-300 text-sm italic">
                    Please upload the Volunteer Roster in the top navigation bar to begin deployment.
                </div>
            ) : (
                <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] font-black">
                    <th className="pb-3">Volunteer</th>
                    <th className="pb-3">Skillset</th>
                    <th className="pb-3">Base Location</th>
                    <th className="pb-3 text-center">Tracking</th>
                    <th className="pb-3 text-right px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {volunteers.map((vol) => (
                    <tr key={vol.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="py-4 font-bold text-slate-700">{vol.name}</td>
                      <td className="py-4">
                        <span className="px-2 py-1 rounded text-[10px] font-black bg-blue-100 text-blue-800 uppercase tracking-tighter">{vol.skill}</span>
                      </td>
                      <td className="py-4 text-gray-400 text-xs">{vol.location}</td>
                      <td className="py-4 text-center">
                         <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${taskStatus[vol.name] ? 'bg-orange-100 text-orange-600' : 'text-slate-300'}`}>
                            {taskStatus[vol.name] || 'Unassigned'}
                         </span>
                      </td>
                      <td className="py-4 text-right px-4">
                        <button 
                          onClick={() => handleAssign(vol)} 
                          disabled={assigned[vol.name] || !selectedState} 
                          className={`font-black text-xs transition-all uppercase px-4 py-2 rounded-lg ${assigned[vol.name] ? "text-green-500 bg-green-50 cursor-default" : selectedState ? "bg-slate-900 text-white hover:bg-blue-600" : "text-gray-300 bg-gray-100 cursor-not-allowed"}`}
                        >
                          {assigned[vol.name] ? "Deployed ✅" : "Deploy Now"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
      {/* --- CHAT OVERLAY --- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        
        {/* 1. THE FLOATING BUTTON */}
        <button 
          onClick={() => {
            setIsChatOpen(!isChatOpen);
            if (!isChatOpen) {
              // When opening, clear the dot and mark the latest as 'seen'
              setHasNewMessage(false); 
              if (messages.length > 0) {
                setLastProcessedMsgId(messages[messages.length - 1].id);
              }
            }
          }}
          className="relative"
        >
          <MessageCircle size={24} />
          {hasNewMessage && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
          )}
        </button>

        {/* 2. THE CHAT WINDOW (Only shows if isChatOpen is true) */}
        {isChatOpen && (
          <div className="absolute bottom-20 right-0 w-80 h-112.5 bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            
            {/* Header */}
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <span className="text-xs font-black tracking-widest uppercase">Support Chat</span>
              <button onClick={() => setIsChatOpen(false)}><X size={18} /></button>
            </div>

            {/* Messages List (This is the part you already had) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {messages.map((m) => {
                const isMe = m.senderId === (userRole === 'admin' ? "Admin" : currentUser?.name);
                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] font-black uppercase text-slate-400 mb-1 px-1">{m.senderId}</span>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-xs font-bold ${
                      m.senderId === "Admin" ? 'bg-slate-900 text-white' : isMe ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 shadow-sm border'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Area - Place this right before the last </div> of the chat window */}
            <div className="p-3 bg-white border-t flex gap-2">
              <input 
                type="text"
                value={newMessageText} // CRITICAL: This links the box to your state
                onChange={(e) => setNewMessageText(e.target.value)} // Updates state as you type
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); // Prevents page reload
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 bg-slate-100 p-2 rounded-xl text-xs outline-none text-slate-900"
              />
              <button 
                onClick={sendMessage} 
                className="text-blue-600 hover:scale-110 transition-transform"
              >
                <Send size={20}/>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;