// 课表数据 —— 由 课程数据.json 自动生成，改数据请改 JSON 后重新生成。
// 生成脚本：D:\CODEX\.tmp-timetable\gen_data_js.py
// 用普通脚本（不是 ES 模块），这样 file:// 双击打开也能用。

window.TT = window.TT || {};

TT.META = {
  school: "武汉大学",
  term: "2026-2027学年 第一学期",
  studentId: "2026281060070",
  student: "常克强",
  exportedAt: "2026-09-14 15:31:19",
  source: "武汉大学研究生院学生课表导出",
  week1Monday: "2026-09-07",
  termWeeks: 20
};

TT.PERIODS = [
  {n:1, start:"08:00", end:"08:45"},
  {n:2, start:"08:50", end:"09:35"},
  {n:3, start:"09:50", end:"10:35"},
  {n:4, start:"10:40", end:"11:25"},
  {n:5, start:"11:30", end:"12:15"},
  {n:6, start:"14:05", end:"14:50"},
  {n:7, start:"14:55", end:"15:40"},
  {n:8, start:"15:45", end:"16:30"},
  {n:9, start:"16:40", end:"17:25"},
  {n:10, start:"17:30", end:"18:15"},
  {n:11, start:"18:30", end:"19:15"},
  {n:12, start:"19:20", end:"20:05"},
  {n:13, start:"20:10", end:"20:55"}
];

TT.COURSES = [
  {uid:0, day:1, start:2, end:5, weeks:[3, 14], name:"民法学概论", cls:"26级法律（非法学）", teacher:"余立力", room:"文理学部 1区法-123"},
  {uid:1, day:1, start:6, end:9, weeks:[3, 14], name:"刑法学概论", cls:"26级法律（非法学）", teacher:"李颖峰,蔡颖", room:"文理学部 1区法-115"},
  {uid:2, day:2, start:2, end:5, weeks:[3, 10], name:"婚姻家庭与继承法专题", cls:"婚姻家庭与继承法专题01", teacher:"申晨", room:"法326"},
  {uid:3, day:2, start:6, end:8, weeks:[1, 11], name:"思想政治理论课（硕士1）", cls:"10", teacher:"黄兆琼", room:"文理学部 1区枫-206"},
  {uid:4, day:3, start:2, end:5, weeks:[3, 10], name:"外国刑事诉讼法专题", cls:"外国刑事诉讼法专题01", teacher:"崔凯", room:"法211"},
  {uid:5, day:3, start:6, end:9, weeks:[3, 10], name:"法理学概论", cls:"26级法律（非法学）", teacher:"占红沣", room:"信息学部 3区1-303"},
  {uid:6, day:3, start:11, end:13, weeks:[3, 13], name:"习近平法治思想", cls:"习近平法治思想01", teacher:"廖奕,桂晓伟,陈海嵩,伍德志,李栋", room:"模拟法庭"},
  {uid:7, day:4, start:2, end:5, weeks:[3, 10], name:"宪法学与行政法学概论", cls:"26级法律（非法学）", teacher:"李炳辉", room:"信息学部 3区1-502"},
  {uid:8, day:4, start:2, end:5, weeks:[12, 15], name:"法律职业伦理与规范", cls:"26级法律硕士", teacher:"彭超", room:"法学院模拟法庭"},
  {uid:9, day:4, start:11, end:13, weeks:[3, 10], name:"西方法理学专题", cls:"西方法理学专题01", teacher:"桂晓伟", room:"法333"},
  {uid:10, day:5, start:2, end:5, weeks:[3, 10], name:"法学方法论", cls:"法学方法论02", teacher:"陈金林", room:"法329"},
  {uid:12, day:5, start:6, end:6, weeks:[11, 16], name:"马克思主义与社会科学方法论", cls:"10", teacher:"于涓", room:"文理学部 1区5-105"},
  {uid:13, day:5, start:7, end:8, weeks:[11, 15], name:"马克思主义与社会科学方法论", cls:"10", teacher:"于涓", room:"文理学部 1区5-105"},
  {uid:14, day:5, start:10, end:13, weeks:[3, 14], name:"涉外刑法与刑事诉讼原理与实务", cls:"涉外刑法与刑事诉讼原理与实务01", teacher:"陈金林", room:"文理学部 1区枫-106"},
  {uid:15, day:6, start:2, end:5, weeks:[5, 8], name:"论文写作指导", cls:"论文写作指导2042021010740008", teacher:"武亦文,陈金林,梁君瑜,崔凯,李栋", room:"模拟法庭"},
  {uid:16, day:2, start:6, end:9, weeks:[3, 10], name:"民法总论专题", cls:"民法总论专题01", teacher:"扬巍", room:"法326", code:"201402185", audit:true},
  {uid:17, day:2, start:6, end:9, weeks:[3, 10], name:"中国刑法总论", cls:"", teacher:"陈家林,李颖峰", room:"法329", audit:true},
  {uid:18, day:3, start:6, end:9, weeks:[3, 10], name:"民事诉讼法专题", cls:"", teacher:"占善刚,刘学在", room:"法221", audit:true}
];

TT.DAYNAME = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
TT.WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
