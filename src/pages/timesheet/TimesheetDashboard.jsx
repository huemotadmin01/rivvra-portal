import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { usePlatform } from '../../context/PlatformContext';
import { usePeriod } from '../../context/PeriodContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import timesheetApi, { getMyLeaveBalances, getPendingLeaveRequests } from '../../utils/timesheetApi';
import { PageSkeleton, HeaderSkeleton, CardGridSkeleton, TwoCardSkeleton, PendingListSkeleton, CardListSkeleton } from '../../components/Skeletons';
import {
  CalendarDays, IndianRupee, Clock, CheckCircle2, CalendarCheck, ChevronDown, Loader2,
  FileText, AlertCircle, ArrowRight, UserX, CalendarOff, Briefcase,
  Heart, Award, PartyPopper, MessageCircle, Send, Trash2, Plus, Megaphone,
  Cake, Gift,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Avatar helper — shows Google profile image or letter initial
function Avatar({ name, picture, size = 'md', gradient = false }) {
  const sizes = { sm: 'w-6 h-6 text-[9px]', md: 'w-9 h-9 text-sm', lg: 'w-10 h-10 text-base' };
  const cls = sizes[size] || sizes.md;
  if (picture) return <img src={picture} alt="" className={`${cls} rounded-full object-cover flex-shrink-0`} referrerPolicy="no-referrer" />;
  return (
    <div className={`${cls} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${gradient ? 'bg-gradient-to-br from-rivvra-500 to-emerald-600 text-white' : 'bg-gradient-to-br from-dark-600 to-dark-700 text-dark-300'}`}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    draft: 'bg-dark-700 text-dark-400',
    submitted: 'bg-amber-500/10 text-amber-400',
    approved: 'bg-emerald-500/10 text-emerald-400',
    rejected: 'bg-red-500/10 text-red-400',
    'not-created': 'bg-dark-700 text-dark-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.draft}`}>
      {status?.replace('-', ' ')}
    </span>
  );
}

const leaveTypeColors = {
  sick_leave: 'from-red-400/20 to-red-500/20 text-red-400',
  casual_leave: 'from-blue-400/20 to-blue-500/20 text-blue-400',
  earned_leave: 'from-emerald-400/20 to-emerald-500/20 text-emerald-400',
  compensatory_off: 'from-purple-400/20 to-purple-500/20 text-purple-400',
  comp_off: 'from-purple-400/20 to-purple-500/20 text-purple-400',
};
const leaveTypeLabels = {
  sick_leave: 'Sick', casual_leave: 'Casual', earned_leave: 'Earned',
  compensatory_off: 'Comp Off', comp_off: 'Comp Off',
};

function ContractorDashboard() {
  const { timesheetUser } = useTimesheetContext();
  const { showToast } = useToast();
  const { orgPath } = usePlatform();
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [disbursement, setDisbursement] = useState(null);
  const [timesheets, setTimesheets] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState(null);
  const [loading, setLoading] = useState(true);
  // Social feed state
  const [celebrations, setCelebrations] = useState([]);
  const [posts, setPosts] = useState([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [showNewPost, setShowNewPost] = useState(false);
  const [postingComment, setPostingComment] = useState({});
  const [commentInputs, setCommentInputs] = useState({});

  // Billable internal consultants use the same ESS view as external consultants
  const isBillableIC = timesheetUser?.employmentType === 'internal_consultant' && timesheetUser?.billable;
  // Hide earnings for confirmed/non-billable internal/intern employees (they use payroll system)
  const ATTENDANCE_TYPES = ['confirmed', 'internal_consultant', 'intern'];
  const hideEarnings = !isBillableIC && ATTENDANCE_TYPES.includes(timesheetUser?.employmentType);
  const isConfirmed = !isBillableIC && ATTENDANCE_TYPES.includes(timesheetUser?.employmentType);

  // Leave eligibility
  const empType = timesheetUser?.employmentType;
  const isLeaveEligible = empType && empType !== 'external_consultant'
    && !(empType === 'internal_consultant' && timesheetUser?.billable);

  useEffect(() => {
    const controller = new AbortController();
    const sig = { signal: controller.signal };
    const fetches = [
      timesheetApi.get('/timesheets', sig).then(r => {
        const all = r.data || [];
        if (isConfirmed) {
          // For confirmed employees: prefer approved timesheet over draft attendance per month
          const byMonth = {};
          for (const t of all) {
            const key = `${t.year}-${t.month}`;
            const existing = byMonth[key];
            if (!existing) { byMonth[key] = t; continue; }
            // Prefer approved/submitted timesheet over draft attendance
            if (t.isAttendance && !existing.isAttendance && ['approved', 'submitted'].includes(existing.status)) continue;
            if (!t.isAttendance && ['approved', 'submitted'].includes(t.status) && existing.isAttendance) { byMonth[key] = t; continue; }
            // Between same type, prefer non-draft
            if (existing.status === 'draft' && t.status !== 'draft') byMonth[key] = t;
          }
          setTimesheets(Object.values(byMonth).sort((a, b) => b.year - a.year || b.month - a.month));
        } else {
          setTimesheets(all.filter(t => !t.isAttendance));
        }
      }).catch(() => {}),
    ];
    if (!hideEarnings) {
      fetches.push(
        timesheetApi.get('/earnings/current', sig).then(r => setCurrent(r.data)).catch(() => {}),
        timesheetApi.get('/earnings/previous', sig).then(r => setPrevious(r.data)).catch(() => {}),
        timesheetApi.get('/earnings/disbursement-info', sig).then(r => setDisbursement(r.data)).catch(() => {}),
      );
    }
    if (isLeaveEligible) {
      fetches.push(
        getMyLeaveBalances().then(data => {
          if (data?.leaveTypes && data?.balances && !Array.isArray(data.balances)) {
            const balObj = data.balances;
            data.balances = data.leaveTypes.map(lt => ({
              leaveType: lt.code, name: lt.name, ...balObj[lt.code], policy: lt,
            }));
          }
          setLeaveBalances(data);
        }).catch(() => {}),
      );
    }
    // Social feed data
    fetches.push(
      timesheetApi.get('/celebrations?days=30', sig).then(r => setCelebrations(r.data?.celebrations || [])).catch(() => {}),
      timesheetApi.get('/posts?limit=10', sig).then(r => setPosts(r.data?.posts || [])).catch(() => {}),
    );
    Promise.all(fetches).finally(() => setLoading(false));
    return () => controller.abort();
  }, [hideEarnings, isLeaveEligible]);

  // Social feed handlers
  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    try {
      const res = await timesheetApi.post('/posts', { content: newPostContent.trim() });
      if (res.data?.post) setPosts(prev => [res.data.post, ...prev]);
      setNewPostContent('');
      setShowNewPost(false);
    } catch (err) { /* silently fail */ }
  };
  const handleReact = async (postId, emoji) => {
    try {
      const res = await timesheetApi.post(`/posts/${postId}/react`, { emoji });
      if (res.data?.reactions) {
        setPosts(prev => prev.map(p => p._id === postId ? { ...p, reactions: res.data.reactions } : p));
      }
    } catch (err) { /* silently fail */ }
  };
  const handleComment = async (postId) => {
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    setPostingComment(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await timesheetApi.post(`/posts/${postId}/comment`, { content });
      if (res.data?.comment) {
        setPosts(prev => prev.map(p => p._id === postId ? { ...p, comments: [...(p.comments || []), res.data.comment] } : p));
        setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      }
    } catch (err) { /* silently fail */ }
    finally { setPostingComment(prev => ({ ...prev, [postId]: false })); }
  };
  const handleDeletePost = async (postId) => {
    try {
      await timesheetApi.delete(`/posts/${postId}`);
      setPosts(prev => prev.filter(p => p._id !== postId));
    } catch (err) { /* silently fail */ }
  };
  const myId = timesheetUser?._id;

  if (loading) return (
    <PageSkeleton>
      <HeaderSkeleton titleW="w-52" subtitleW="w-48" />
      <CardGridSkeleton count={3} />
      <TwoCardSkeleton />
      <CardListSkeleton count={3} />
    </PageSkeleton>
  );

  // Current period timesheet status (from period picker)
  const { month: currentMonth, year: currentYear } = usePeriod();
  const currentTs = timesheets.find(ts => ts.month === currentMonth && ts.year === currentYear);
  const tsStatus = currentTs?.status || 'not-created';
  const tsStatusLabel = {
    'not-created': 'Not Started',
    draft: 'Draft',
    submitted: 'Submitted',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  const tsStatusColor = {
    'not-created': 'text-dark-400 bg-dark-700',
    draft: 'text-amber-400 bg-amber-500/10',
    submitted: 'text-blue-400 bg-blue-500/10',
    approved: 'text-emerald-400 bg-emerald-500/10',
    rejected: 'text-red-400 bg-red-500/10',
  };
  const tsNeedsFilling = tsStatus === 'not-created' || tsStatus === 'draft' || tsStatus === 'rejected';

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Welcome, {timesheetUser?.fullName}</h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {(timesheetUser?.employmentType || timesheetUser?.joiningDate) && (
            <div className="flex items-center gap-2 text-xs text-dark-500">
              {timesheetUser?.employmentType && (
                <span className="flex items-center gap-1 bg-dark-800 border border-dark-700 px-2 py-0.5 rounded-full">
                  <Briefcase size={10} />
                  {timesheetUser.employmentType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
              )}
              {timesheetUser?.joiningDate && (
                <span className="bg-dark-800 border border-dark-700 px-2 py-0.5 rounded-full">
                  Joined {formatDateUTC(timesheetUser.joiningDate)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Celebrations Carousel */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">🎉 Celebrations</h2>
          <span className="text-xs text-dark-500">{celebrations.length > 0 ? `${celebrations.length} upcoming` : 'Next 30 days'}</span>
        </div>
        {celebrations.length === 0 ? (
          <p className="text-sm text-dark-500 text-center py-4">No birthdays or work anniversaries in the next 30 days</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {celebrations.map((c, i) => {
              const daysFromNow = Math.round((new Date(c.date) - new Date(new Date().toDateString())) / 86400000);
              const label = c.isToday ? 'Today' : daysFromNow === 1 ? 'Tomorrow' : formatDateUTC(c.date, { day: 'numeric', month: 'short' });
              return (
                <div key={i} className={`flex-shrink-0 w-44 rounded-xl p-3 border ${c.isToday ? 'border-rivvra-500/30 bg-rivvra-500/5' : 'border-dark-700 bg-dark-800/50'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 ${c.type === 'birthday' ? 'bg-pink-500/10' : 'bg-purple-500/10'}`}>
                  {c.type === 'birthday' ? <Cake size={18} className="text-pink-400" /> : <Gift size={18} className="text-purple-400" />}
                </div>
                  <p className="text-sm font-medium text-white truncate">{c.employeeName}</p>
                  <p className="text-[10px] text-dark-400 truncate">{c.designation}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] font-medium text-dark-300">
                      {c.type === 'birthday' ? 'Birthday' : `${c.detail} Anniversary`}
                    </span>
                    {c.isToday ? (
                      <span className="text-[9px] bg-rivvra-500/20 text-rivvra-400 px-1.5 py-0.5 rounded-full font-medium">Today</span>
                    ) : (
                      <span className="text-[9px] text-dark-500">{label}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Social Feed */}
      <div className="space-y-3">
        {/* New Post Card */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Avatar name={timesheetUser?.fullName} picture={timesheetUser?.picture} gradient />
            {!showNewPost ? (
              <button onClick={() => setShowNewPost(true)}
                className="flex-1 text-left px-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-full text-sm text-dark-500 hover:border-dark-600 hover:text-dark-400 transition-colors">
                Share an update or announcement...
              </button>
            ) : (
              <div className="flex-1 space-y-2">
                <textarea value={newPostContent} onChange={e => setNewPostContent(e.target.value)}
                  placeholder="What's on your mind?"
                  className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-sm text-white placeholder-dark-500 focus:border-rivvra-500 focus:outline-none resize-none" rows={3} maxLength={2000} autoFocus />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-dark-600">{newPostContent.length}/2000</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowNewPost(false); setNewPostContent(''); }} className="px-3 py-1.5 text-xs text-dark-400 hover:text-dark-300">Cancel</button>
                    <button onClick={handleCreatePost} disabled={!newPostContent.trim()}
                      className="px-4 py-1.5 bg-rivvra-600 text-white text-xs rounded-lg font-medium hover:bg-rivvra-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                      <Send size={12} /> Post
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Posts List */}
        {posts.length === 0 && (
          <div className="card p-8 text-center">
            <Megaphone size={28} className="text-dark-600 mx-auto mb-2" />
            <p className="text-sm text-dark-500">No posts yet</p>
            <p className="text-xs text-dark-600 mt-1">Be the first to share something with your team!</p>
          </div>
        )}
        {posts.map(post => {
          const commentCount = (post.comments || []).length;
          const timeAgo = (() => {
            const diff = Date.now() - new Date(post.createdAt).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'Just now';
            if (mins < 60) return `${mins}m`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h`;
            const days = Math.floor(hrs / 24);
            if (days < 7) return `${days}d`;
            return formatDateUTC(post.createdAt, { year: undefined });
          })();
          const reactionIcons = [
            { key: '❤️', Icon: Heart, activeColor: 'text-red-400', activeBg: 'bg-red-500/10' },
            { key: '👏', Icon: Award, activeColor: 'text-amber-400', activeBg: 'bg-amber-500/10' },
            { key: '🎉', Icon: PartyPopper, activeColor: 'text-purple-400', activeBg: 'bg-purple-500/10' },
          ];
          return (
            <div key={post._id} className="card p-4 space-y-3">
              {/* Author */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <Avatar name={post.authorName} picture={post.authorPicture} />
                  <div>
                    <p className="text-sm font-medium text-white leading-tight">{post.authorName}</p>
                    <p className="text-[11px] text-dark-500">{post.authorDesignation}{post.authorDesignation && ' · '}{timeAgo}</p>
                  </div>
                </div>
                {(post.authorId === myId || timesheetUser?.role === 'admin') && (
                  <button onClick={() => handleDeletePost(post._id)} className="p-1 text-dark-600 hover:text-red-400 rounded hover:bg-dark-800 transition-colors" title="Delete">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Content */}
              <p className="text-[13px] text-dark-200 whitespace-pre-wrap leading-relaxed">{post.content}</p>

              {/* Reaction summary */}
              {(() => {
                const total = Object.values(post.reactions || {}).reduce((s, arr) => s + (arr?.length || 0), 0);
                return total > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-500">
                    <div className="flex -space-x-1">
                      {reactionIcons.filter(r => (post.reactions?.[r.key] || []).length > 0).map(r => (
                        <span key={r.key} className={`w-5 h-5 rounded-full flex items-center justify-center ${r.activeBg} border border-dark-900`}>
                          <r.Icon size={10} className={r.activeColor} />
                        </span>
                      ))}
                    </div>
                    <span>{total}</span>
                    {commentCount > 0 && <span className="ml-auto">{commentCount} comment{commentCount > 1 ? 's' : ''}</span>}
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="flex items-center border-t border-dark-800 pt-2 -mx-1">
                {reactionIcons.map(({ key, Icon, activeColor, activeBg }) => {
                  const users = post.reactions?.[key] || [];
                  const iReacted = users.includes(myId);
                  return (
                    <button key={key} onClick={() => handleReact(post._id, key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${iReacted ? `${activeBg} ${activeColor}` : 'text-dark-500 hover:bg-dark-800 hover:text-dark-300'}`}>
                      <Icon size={14} className={iReacted ? activeColor : ''} fill={iReacted ? 'currentColor' : 'none'} />
                      {users.length > 0 && users.length}
                    </button>
                  );
                })}
                <button onClick={() => document.getElementById(`comment-${post._id}`)?.focus()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-dark-500 hover:bg-dark-800 hover:text-dark-300 ml-auto transition-all">
                  <MessageCircle size={14} /> Comment
                </button>
              </div>

              {/* Comments */}
              {commentCount > 0 && (
                <div className="space-y-2 pt-1">
                  {(post.comments || []).map(comment => (
                    <div key={comment._id} className="flex items-start gap-2 pl-2">
                      <Avatar name={comment.authorName} picture={comment.authorPicture} size="sm" />
                      <div className="flex-1 min-w-0 bg-dark-800/50 rounded-xl px-3 py-1.5">
                        <span className="text-[11px] font-medium text-dark-300">{comment.authorName}</span>
                        <p className="text-xs text-dark-400 leading-relaxed">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Comment input */}
              <div className="flex items-center gap-2 pt-1">
                <Avatar name={timesheetUser?.fullName} picture={timesheetUser?.picture} size="sm" gradient />
                <div className="flex-1 flex items-center bg-dark-800/50 border border-dark-700 rounded-full px-3 py-1 focus-within:border-dark-600">
                  <input id={`comment-${post._id}`} type="text" value={commentInputs[post._id] || ''}
                    onChange={e => setCommentInputs(prev => ({ ...prev, [post._id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleComment(post._id)}
                    placeholder="Write a comment..."
                    className="flex-1 bg-transparent text-xs text-white placeholder-dark-600 focus:outline-none" />
                  {commentInputs[post._id]?.trim() && (
                    <button onClick={() => handleComment(post._id)} disabled={postingComment[post._id]}
                      className="text-rivvra-400 hover:text-rivvra-300 ml-1 disabled:opacity-50">
                      <Send size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current Month Timesheet Status — hidden for confirmed employees who use attendance */}
      {!isConfirmed && <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tsStatus === 'approved' ? 'bg-emerald-500/10' : tsStatus === 'submitted' ? 'bg-blue-500/10' : tsStatus === 'rejected' ? 'bg-red-500/10' : 'bg-dark-700'}`}>
              {tsStatus === 'approved' ? (
                <CheckCircle2 size={20} className="text-emerald-400" />
              ) : (
                <CalendarDays size={20} className={tsStatus === 'submitted' ? 'text-blue-400' : tsStatus === 'rejected' ? 'text-red-400' : 'text-dark-400'} />
              )}
            </div>
            <div>
              <p className="text-sm text-dark-400">{fullMonthNames[currentMonth]} {currentYear}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tsStatusColor[tsStatus]}`}>
                  {tsStatusLabel[tsStatus]}
                </span>
                {currentTs?.totalWorkingDays != null && (
                  <span className="text-xs text-dark-500">{currentTs.totalWorkingDays} working days</span>
                )}
              </div>
              {tsStatus === 'rejected' && currentTs?.rejectionReason && (
                <p className="text-xs text-red-400/70 mt-1">Reason: {currentTs.rejectionReason}</p>
              )}
            </div>
          </div>
          <Link
            to={orgPath(isConfirmed ? '/timesheet/my-attendance' : '/timesheet/my-timesheet')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              tsNeedsFilling
                ? 'bg-rivvra-500 text-dark-950 hover:bg-rivvra-400'
                : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
            }`}
          >
            <CalendarDays size={13} />
            {isConfirmed ? 'My Attendance' : (tsNeedsFilling ? 'Fill Timesheet' : 'View Timesheet')}
          </Link>
        </div>
      </div>}

      {/* Earnings cards — hidden for confirmed+billable employees (temporary) */}
      {!hideEarnings && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-dark-400">
                {current ? `${monthNames[current.month]} ${current.year}` : 'Current Month'}
              </span>
              <StatusBadge status={current?.timesheetStatus} />
            </div>
            {current?.earnings?.grossAmount != null ? (
              <>
                <p className="text-sm text-dark-400">Gross: ₹{current.earnings.grossAmount.toLocaleString()}</p>
                {current.earnings.tdsAmount > 0 && <p className="text-xs text-red-400">TDS (2%): -₹{current.earnings.tdsAmount.toLocaleString()}</p>}
                <p className="text-2xl font-bold text-emerald-400 mt-1">₹{(current.earnings.netAmount || current.earnings.grossAmount).toLocaleString()}</p>
              </>
            ) : <p className="text-2xl font-bold text-white">—</p>}
            <p className="text-xs text-dark-500 mt-1">{current?.earnings?.calculation || ''}</p>
            {current?.estimateNote && (
              <p className="text-xs text-amber-400/80 mt-1 italic">{current.estimateNote}</p>
            )}
            {current?.statusLabel && <p className={`text-xs mt-2 font-medium ${current?.timesheetStatus === 'rejected' ? 'text-red-400' : current?.timesheetStatus === 'not-created' ? 'text-amber-400' : 'text-blue-400'}`}>{current.statusLabel}</p>}
            {current?.timesheetStatus === 'rejected' && current?.rejectionReason && (
              <p className="text-xs text-red-400/70 mt-1">Reason: {current.rejectionReason}</p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-dark-400">
                {previous ? `${monthNames[previous.month]} ${previous.year}` : 'Previous Month'}
              </span>
              <StatusBadge status={previous?.timesheetStatus} />
            </div>
            {previous?.earnings?.grossAmount != null ? (
              <>
                <p className="text-sm text-dark-400">Gross: ₹{previous.earnings.grossAmount.toLocaleString()}</p>
                {previous.earnings.tdsAmount > 0 && <p className="text-xs text-red-400">TDS (2%): -₹{previous.earnings.tdsAmount.toLocaleString()}</p>}
                <p className="text-2xl font-bold text-emerald-400 mt-1">₹{(previous.earnings.netAmount || previous.earnings.grossAmount).toLocaleString()}</p>
              </>
            ) : <p className="text-2xl font-bold text-white">—</p>}
            <p className="text-xs text-dark-500 mt-1">{previous?.breakdown?.totalWorkingDays || 0} working days</p>
            {previous?.disbursement?.status && (
              <span className={`text-xs font-medium mt-2 inline-block ${previous.disbursement.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {previous.disbursement.status === 'paid' ? 'Paid' : 'Payment Pending'}
              </span>
            )}
          </div>

          <div className={`card p-5 ${disbursement?.daysUntil <= 7 ? 'border-blue-500/20' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-blue-400" />
              <span className="text-sm text-dark-400">Next Salary</span>
            </div>
            {disbursement?.nextDisbursementDate ? (
              <>
                <p className="text-2xl font-bold text-white">
                  {formatDateUTC(disbursement.nextDisbursementDate, { year: undefined })}
                </p>
                {disbursement.salaryMonth && disbursement.salaryYear && (
                  <p className="text-xs text-dark-500 mt-0.5">{monthNames[disbursement.salaryMonth]} {disbursement.salaryYear} salary</p>
                )}
                {disbursement.countdown && <p className="text-sm text-blue-400 font-medium mt-1">{disbursement.countdown}</p>}
                {disbursement.note && <p className="text-xs text-dark-500 mt-1">{disbursement.note}</p>}
              </>
            ) : (
              <p className="text-dark-500">Not configured</p>
            )}
          </div>
        </div>
      )}

      {/* Leave Balance Widget */}
      {isLeaveEligible && leaveBalances?.balances?.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-dark-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarOff size={16} className="text-rivvra-400" />
              <h3 className="font-semibold text-white text-sm">Leave Balance</h3>
            </div>
            <Link to={orgPath('/timesheet/leave/apply')} className="text-rivvra-400 text-xs font-medium hover:text-rivvra-300 flex items-center gap-1">
              Apply <ArrowRight size={12} />
            </Link>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {leaveBalances.balances.map((bal) => {
              const colors = leaveTypeColors[bal.leaveType] || 'from-dark-600/20 to-dark-700/20 text-dark-400';
              return (
                <div key={bal.leaveType} className="text-center">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors} flex items-center justify-center mx-auto mb-2`}>
                    <span className="text-lg font-bold">{bal.available ?? 0}</span>
                  </div>
                  <p className="text-xs text-dark-400">{leaveTypeLabels[bal.leaveType] || bal.leaveType}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 sm:gap-3">
        <Link to={orgPath(isConfirmed ? '/timesheet/my-attendance' : '/timesheet/my-timesheet')} className="bg-rivvra-500 text-dark-950 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 sm:gap-2 transition-colors">
          <CalendarDays size={14} /> {isConfirmed ? 'My Attendance' : 'Fill Timesheet'}
        </Link>
        {!hideEarnings && (
          <Link to={orgPath('/timesheet/earnings')} className="bg-dark-800 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-dark-700 flex items-center gap-1.5 sm:gap-2 transition-colors">
            <IndianRupee size={14} /> View Earnings
          </Link>
        )}
        {isLeaveEligible && (
          <Link to={orgPath('/timesheet/leave/my-requests')} className="bg-dark-800 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-dark-700 flex items-center gap-1.5 sm:gap-2 transition-colors">
            <CalendarOff size={14} /> My Leaves
          </Link>
        )}
      </div>

      <div className="card">
        <div className="p-4 border-b border-dark-800">
          <h3 className="font-semibold text-white">{isConfirmed ? 'Recent Attendance' : 'Recent Entries'}</h3>
        </div>
        <div className="divide-y divide-dark-800">
          {timesheets.length === 0 ? (
            <p className="p-4 text-sm text-dark-500">{isConfirmed ? 'No attendance records yet' : 'No entries yet'}</p>
          ) : (
            timesheets.slice(0, 5).map(ts => (
              <div key={ts._id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-white">{monthNames[ts.month]} {ts.year}{ts.project?.name ? ` — ${ts.project.name}` : ''}</p>
                  <p className="text-xs text-dark-500">
                    {ts.isAttendance && ts.status === 'draft' && (ts.presentDays || 0) === 0 && (ts.halfDays || 0) === 0
                      ? 'Not filled yet'
                      : `${ts.totalWorkingDays} working days`}
                  </p>
                  {ts.status === 'rejected' && ts.rejectionReason && (
                    <p className="text-xs text-red-400/70 mt-0.5">Reason: {ts.rejectionReason}</p>
                  )}
                </div>
                <StatusBadge status={ts.status} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const fullMonthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const empTypeBadge = {
  confirmed: 'bg-blue-500/10 text-blue-400',
  internal_consultant: 'bg-purple-500/10 text-purple-400',
  external_consultant: 'bg-amber-500/10 text-amber-400',
  intern: 'bg-emerald-500/10 text-emerald-400',
};
const empTypeLabel = {
  confirmed: 'Confirmed',
  internal_consultant: 'Internal',
  external_consultant: 'External',
  intern: 'Intern',
};

function AdminDashboard() {
  const { timesheetUser } = useTimesheetContext();
  const { showToast } = useToast();
  const { orgPath } = usePlatform();
  const [timesheets, setTimesheets] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tsDataReady, setTsDataReady] = useState(false);
  const [attDataReady, setAttDataReady] = useState(false);
  // Social feed state
  const [celebrations, setCelebrations] = useState([]);
  const [posts, setPosts] = useState([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [showNewPost, setShowNewPost] = useState(false);
  const [postingComment, setPostingComment] = useState({});
  const [commentInputs, setCommentInputs] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    const sig = { signal: controller.signal };
    // Fetch only current month + submitted timesheets (not ALL history)
    Promise.all([
      timesheetApi.get('/timesheets/summary', sig).then(r => {
        const all = r.data || [];
        setTimesheets(all.filter(t => !t.isAttendance));
        setAttendances(all.filter(t => t.isAttendance));
        setTsDataReady(true);
        setAttDataReady(true);
      }).catch(() => {
        // Fallback: fetch ALL months so period filtering works
        timesheetApi.get('/timesheets?all=true', sig).then(r => {
          const all = r.data || [];
          setTimesheets(all.filter(t => !t.isAttendance));
          setAttendances(all.filter(t => t.isAttendance));
          setTsDataReady(true);
          setAttDataReady(true);
        }).catch(() => { setTsDataReady(true); setAttDataReady(true); });
      }),
      getPendingLeaveRequests().then(data => {
        const arr = Array.isArray(data) ? data : data?.leaveRequests || data?.requests || [];
        setPendingLeaves(arr.length);
      }).catch(() => {}),
      timesheetApi.get('/celebrations?days=30', sig).then(r => setCelebrations(r.data?.celebrations || [])).catch(() => {}),
      timesheetApi.get('/posts?limit=10', sig).then(r => setPosts(r.data?.posts || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  // Social feed handlers
  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    try {
      const res = await timesheetApi.post('/posts', { content: newPostContent.trim() });
      if (res.data?.post) setPosts(prev => [res.data.post, ...prev]);
      setNewPostContent('');
      setShowNewPost(false);
    } catch (err) { /* silently fail */ }
  };
  const handleReact = async (postId, emoji) => {
    try {
      const res = await timesheetApi.post(`/posts/${postId}/react`, { emoji });
      if (res.data?.reactions) setPosts(prev => prev.map(p => p._id === postId ? { ...p, reactions: res.data.reactions } : p));
    } catch (err) { /* silently fail */ }
  };
  const handleComment = async (postId) => {
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    setPostingComment(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await timesheetApi.post(`/posts/${postId}/comment`, { content });
      if (res.data?.comment) {
        setPosts(prev => prev.map(p => p._id === postId ? { ...p, comments: [...(p.comments || []), res.data.comment] } : p));
        setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      }
    } catch (err) { /* silently fail */ }
    finally { setPostingComment(prev => ({ ...prev, [postId]: false })); }
  };
  const handleDeletePost = async (postId) => {
    try {
      await timesheetApi.delete(`/posts/${postId}`);
      setPosts(prev => prev.filter(p => p._id !== postId));
    } catch (err) { /* silently fail */ }
  };
  const myId = timesheetUser?._id;

  // Use period context for month/year filtering
  const { month: periodMonth, year: periodYear } = usePeriod();

  // Hooks must be called before any early return (Rules of Hooks)
  // Timesheet stats — filtered by selected period
  const pending = useMemo(() => timesheets.filter(t => t.status === 'submitted' && t.month === periodMonth && t.year === periodYear), [timesheets, periodMonth, periodYear]);
  const approvedThisMonth = useMemo(() => {
    return timesheets.filter(t => t.status === 'approved' && t.month === periodMonth && t.year === periodYear);
  }, [timesheets, periodMonth, periodYear]);
  const totalThisMonth = useMemo(() => timesheets.filter(t => t.month === periodMonth && t.year === periodYear), [timesheets, periodMonth, periodYear]);
  // Attendance stats — filtered by selected period
  const attPending = useMemo(() => attendances.filter(t => t.status === 'submitted' && t.month === periodMonth && t.year === periodYear), [attendances, periodMonth, periodYear]);
  const attApprovedThisMonth = useMemo(() => {
    return attendances.filter(t => t.status === 'approved' && t.month === periodMonth && t.year === periodYear);
  }, [attendances, periodMonth, periodYear]);
  const attTotalThisMonth = useMemo(() => attendances.filter(t => t.month === periodMonth && t.year === periodYear), [attendances, periodMonth, periodYear]);

  return (
    <div className="p-3 sm:p-6 flex flex-col gap-4 sm:gap-6">
      <div className="order-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Welcome, {timesheetUser?.fullName}</h1>
        <p className="text-dark-400 text-sm mt-1">{timesheetUser?.role === 'admin' ? 'Admin' : 'Manager'} Dashboard</p>
      </div>

      {/* Celebrations Carousel */}
      <div className="card p-4 order-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">🎉 Celebrations</h2>
          <span className="text-xs text-dark-500">{celebrations.length > 0 ? `${celebrations.length} upcoming` : 'Next 30 days'}</span>
        </div>
        {celebrations.length === 0 ? (
          <p className="text-sm text-dark-500 text-center py-4">No birthdays or work anniversaries in the next 30 days</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {celebrations.map((c, i) => {
              const daysFromNow = Math.round((new Date(c.date) - new Date(new Date().toDateString())) / 86400000);
              const label = c.isToday ? 'Today' : daysFromNow === 1 ? 'Tomorrow' : formatDateUTC(c.date, { day: 'numeric', month: 'short' });
              return (
                <div key={i} className={`flex-shrink-0 w-44 rounded-xl p-3 border ${c.isToday ? 'border-rivvra-500/30 bg-rivvra-500/5' : 'border-dark-700 bg-dark-800/50'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 ${c.type === 'birthday' ? 'bg-pink-500/10' : 'bg-purple-500/10'}`}>
                  {c.type === 'birthday' ? <Cake size={18} className="text-pink-400" /> : <Gift size={18} className="text-purple-400" />}
                </div>
                  <p className="text-sm font-medium text-white truncate">{c.employeeName}</p>
                  <p className="text-[10px] text-dark-400 truncate">{c.designation}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] font-medium text-dark-300">
                      {c.type === 'birthday' ? 'Birthday' : `${c.detail} Anniversary`}
                    </span>
                    {c.isToday ? (
                      <span className="text-[9px] bg-rivvra-500/20 text-rivvra-400 px-1.5 py-0.5 rounded-full font-medium">Today</span>
                    ) : (
                      <span className="text-[9px] text-dark-500">{label}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Social Feed */}
      <div className="space-y-3 order-3">
        {/* New Post Card */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Avatar name={timesheetUser?.fullName} picture={timesheetUser?.picture} gradient />
            {!showNewPost ? (
              <button onClick={() => setShowNewPost(true)}
                className="flex-1 text-left px-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-full text-sm text-dark-500 hover:border-dark-600 hover:text-dark-400 transition-colors">
                Share an update or announcement...
              </button>
            ) : (
              <div className="flex-1 space-y-2">
                <textarea value={newPostContent} onChange={e => setNewPostContent(e.target.value)}
                  placeholder="What's on your mind?"
                  className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-sm text-white placeholder-dark-500 focus:border-rivvra-500 focus:outline-none resize-none" rows={3} maxLength={2000} autoFocus />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-dark-600">{newPostContent.length}/2000</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowNewPost(false); setNewPostContent(''); }} className="px-3 py-1.5 text-xs text-dark-400 hover:text-dark-300">Cancel</button>
                    <button onClick={handleCreatePost} disabled={!newPostContent.trim()}
                      className="px-4 py-1.5 bg-rivvra-600 text-white text-xs rounded-lg font-medium hover:bg-rivvra-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                      <Send size={12} /> Post
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Posts List */}
        {posts.length === 0 && (
          <div className="card p-8 text-center">
            <Megaphone size={28} className="text-dark-600 mx-auto mb-2" />
            <p className="text-sm text-dark-500">No posts yet</p>
            <p className="text-xs text-dark-600 mt-1">Be the first to share something with your team!</p>
          </div>
        )}
        {posts.map(post => {
          const commentCount = (post.comments || []).length;
          const timeAgo = (() => {
              const diff = Date.now() - new Date(post.createdAt).getTime();
              const mins = Math.floor(diff / 60000);
              if (mins < 1) return 'Just now';
              if (mins < 60) return `${mins}m`;
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return `${hrs}h`;
              const days = Math.floor(hrs / 24);
              if (days < 7) return `${days}d`;
              return formatDateUTC(post.createdAt, { year: undefined });
            })();
          const reactionIcons = [
            { key: '❤️', Icon: Heart, activeColor: 'text-red-400', activeBg: 'bg-red-500/10' },
            { key: '👏', Icon: Award, activeColor: 'text-amber-400', activeBg: 'bg-amber-500/10' },
            { key: '🎉', Icon: PartyPopper, activeColor: 'text-purple-400', activeBg: 'bg-purple-500/10' },
          ];
          return (
            <div key={post._id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <Avatar name={post.authorName} picture={post.authorPicture} />
                  <div>
                    <p className="text-sm font-medium text-white leading-tight">{post.authorName}</p>
                    <p className="text-[11px] text-dark-500">{post.authorDesignation}{post.authorDesignation && ' · '}{timeAgo}</p>
                  </div>
                </div>
                {(post.authorId === myId || timesheetUser?.role === 'admin') && (
                  <button onClick={() => handleDeletePost(post._id)} className="p-1 text-dark-600 hover:text-red-400 rounded hover:bg-dark-800 transition-colors" title="Delete">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <p className="text-[13px] text-dark-200 whitespace-pre-wrap leading-relaxed">{post.content}</p>
              {(() => {
                const total = Object.values(post.reactions || {}).reduce((s, arr) => s + (arr?.length || 0), 0);
                return total > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-500">
                    <div className="flex -space-x-1">
                      {reactionIcons.filter(r => (post.reactions?.[r.key] || []).length > 0).map(r => (
                        <span key={r.key} className={`w-5 h-5 rounded-full flex items-center justify-center ${r.activeBg} border border-dark-900`}>
                          <r.Icon size={10} className={r.activeColor} />
                        </span>
                      ))}
                    </div>
                    <span>{total}</span>
                    {commentCount > 0 && <span className="ml-auto">{commentCount} comment{commentCount > 1 ? 's' : ''}</span>}
                  </div>
                );
              })()}
              <div className="flex items-center border-t border-dark-800 pt-2 -mx-1">
                {reactionIcons.map(({ key, Icon, activeColor, activeBg }) => {
                  const users = post.reactions?.[key] || [];
                  const iReacted = users.includes(myId);
                  return (
                    <button key={key} onClick={() => handleReact(post._id, key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${iReacted ? `${activeBg} ${activeColor}` : 'text-dark-500 hover:bg-dark-800 hover:text-dark-300'}`}>
                      <Icon size={14} className={iReacted ? activeColor : ''} fill={iReacted ? 'currentColor' : 'none'} />
                      {users.length > 0 && users.length}
                    </button>
                  );
                })}
                <button onClick={() => document.getElementById(`comment-${post._id}`)?.focus()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-dark-500 hover:bg-dark-800 hover:text-dark-300 ml-auto transition-all">
                  <MessageCircle size={14} /> Comment
                </button>
              </div>
              {commentCount > 0 && (
                <div className="space-y-2 pt-1">
                  {(post.comments || []).map(comment => (
                    <div key={comment._id} className="flex items-start gap-2 pl-2">
                      <Avatar name={comment.authorName} picture={comment.authorPicture} size="sm" />
                      <div className="flex-1 min-w-0 bg-dark-800/50 rounded-xl px-3 py-1.5">
                        <span className="text-[11px] font-medium text-dark-300">{comment.authorName}</span>
                        <p className="text-xs text-dark-400 leading-relaxed">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Avatar name={timesheetUser?.fullName} picture={timesheetUser?.picture} size="sm" gradient />
                <div className="flex-1 flex items-center bg-dark-800/50 border border-dark-700 rounded-full px-3 py-1 focus-within:border-dark-600">
                  <input id={`comment-${post._id}`} type="text" value={commentInputs[post._id] || ''}
                    onChange={e => setCommentInputs(prev => ({ ...prev, [post._id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleComment(post._id)}
                    placeholder="Write a comment..."
                    className="flex-1 bg-transparent text-xs text-white placeholder-dark-600 focus:outline-none" />
                  {commentInputs[post._id]?.trim() && (
                    <button onClick={() => handleComment(post._id)} disabled={postingComment[post._id]}
                      className="text-rivvra-400 hover:text-rivvra-300 ml-1 disabled:opacity-50">
                      <Send size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Timesheet Section ────────────────────────────────────── */}
      <div className="card p-4 border-l-4 border-emerald-500 order-4">
        <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2"><FileText size={15} /> Timesheets</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-dark-800/50 rounded-lg p-3">
            <p className="text-xs text-dark-400 mb-1">Pending</p>
            <p className="text-2xl font-bold text-amber-400">{tsDataReady ? pending.length : <Loader2 size={20} className="animate-spin text-dark-600" />}</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-3">
            <p className="text-xs text-dark-400 mb-1">Approved (Month)</p>
            <p className="text-2xl font-bold text-emerald-400">{tsDataReady ? approvedThisMonth.length : <Loader2 size={20} className="animate-spin text-dark-600" />}</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-3">
            <p className="text-xs text-dark-400 mb-1">Total</p>
            <p className="text-2xl font-bold text-white">{tsDataReady ? totalThisMonth.length : <Loader2 size={20} className="animate-spin text-dark-600" />}</p>
          </div>
        </div>
        {pending.length > 0 && (
          <div className="mt-3 divide-y divide-dark-700/50">
            <div className="flex items-center justify-between py-2">
              <span className="text-xs font-medium text-dark-300">Pending Timesheet Approvals</span>
              <Link to={orgPath('/timesheet/approvals')} className="text-blue-400 text-xs hover:text-blue-300 flex items-center gap-1">View All <ArrowRight size={12} /></Link>
            </div>
            {pending.slice(0, 5).map(ts => (
              <div key={ts._id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-white">{ts.contractor?.fullName} — {monthNames[ts.month]} {ts.year}</p>
                  <p className="text-xs text-dark-500">{ts.project?.name} • {ts.totalWorkingDays} days</p>
                </div>
                <Link to={orgPath('/timesheet/approvals')} className="text-blue-400 text-xs font-medium hover:text-blue-300">Review</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Attendance Section ────────────────────────────────────── */}
      <div className="card p-4 border-l-4 border-blue-500 order-5">
        <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2"><CalendarCheck size={15} /> Attendance</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-dark-800/50 rounded-lg p-3">
            <p className="text-xs text-dark-400 mb-1">Pending</p>
            <p className="text-2xl font-bold text-amber-400">{attDataReady ? attPending.length : <Loader2 size={20} className="animate-spin text-dark-600" />}</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-3">
            <p className="text-xs text-dark-400 mb-1">Approved (Month)</p>
            <p className="text-2xl font-bold text-emerald-400">{attDataReady ? attApprovedThisMonth.length : <Loader2 size={20} className="animate-spin text-dark-600" />}</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-3">
            <p className="text-xs text-dark-400 mb-1">Total</p>
            <p className="text-2xl font-bold text-white">{attDataReady ? attTotalThisMonth.length : <Loader2 size={20} className="animate-spin text-dark-600" />}</p>
          </div>
        </div>
        {attPending.length > 0 && (
          <div className="mt-3 divide-y divide-dark-700/50">
            <div className="flex items-center justify-between py-2">
              <span className="text-xs font-medium text-dark-300">Pending Attendance Approvals</span>
              <Link to={orgPath('/timesheet/attendance/approvals')} className="text-blue-400 text-xs hover:text-blue-300 flex items-center gap-1">View All <ArrowRight size={12} /></Link>
            </div>
            {attPending.slice(0, 5).map(att => (
              <div key={att._id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-white">{att.contractor?.fullName || att.employeeName} — {monthNames[att.month]} {att.year}</p>
                  <p className="text-xs text-dark-500">{att.presentDays || 0} present • {att.totalWorkingDays || 0} working days</p>
                </div>
                <Link to={orgPath('/timesheet/attendance/approvals')} className="text-blue-400 text-xs font-medium hover:text-blue-300">Review</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pending Leaves ────────────────────────────────────── */}
      {pendingLeaves > 0 && (
        <div className="card p-4 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-purple-400 flex items-center gap-2"><CalendarOff size={15} /> Pending Leave Requests</h3>
            <Link to={orgPath('/timesheet/leave/approvals')} className="text-purple-400 text-xs font-medium hover:text-purple-300">
              Review ({pendingLeaves})
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}

export default function TimesheetDashboard() {
  const { timesheetUser, loading, error, refetch } = useTimesheetContext();
  const { getAppRole, currentOrg } = useOrg();

  if (loading) return (
    <PageSkeleton>
      <HeaderSkeleton titleW="w-44" subtitleW="w-36" />
      <CardGridSkeleton count={3} />
    </PageSkeleton>
  );

  if (!timesheetUser) {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <AlertCircle className="w-10 h-10 text-dark-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Unable to load timesheet profile</h2>
          <p className="text-dark-400 text-sm mb-4">{typeof error === 'string' ? error : 'The timesheet server may be starting up. Please try again.'}</p>
          <button onClick={refetch} className="px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-medium hover:bg-rivvra-400 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Org membership role is the source of truth for access control.
  // ts_users.role is only a fallback when no org context exists.
  const orgRole = currentOrg ? getAppRole('timesheet') : null;
  const tsRole = timesheetUser.role; // 'admin' | 'manager' | 'contractor'
  const effectiveRole = orgRole || (tsRole === 'contractor' ? 'member' : tsRole);
  const isMember = effectiveRole === 'member' || effectiveRole === 'contractor';

  if (isMember) return <ContractorDashboard />;
  return <AdminDashboard />;
}
