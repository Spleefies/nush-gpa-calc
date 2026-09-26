// Initialise
window.addEventListener("error", (ev) => {
    alert(`Oops, something went wrong! Error: ${ev.message}`);
})

window.addEventListener("unhandledrejection", (ev) => {
    alert(`Oops, something went wrong! Error: ${ev.message}`);
})

const coPicker = document.querySelector("#co-year");
const gradePicker = document.querySelector("#grade-year");
const semPicker = document.querySelector("#sem-option");

const mainTable = document.querySelector("#course-list");

const availablePOS = await fetch("https://gohjy.github.io/nush-pos-data/contents.json").then(x => x.json());

coPicker.innerHTML = "";

const posCache = {};

for (let i of availablePOS) {
    const option = document.createElement("option");
    option.setAttribute("value", i);
    option.textContent = i;
    coPicker.append(option);
}
coPicker.lastElementChild.setAttribute("selected", "");

function lockInput(lock=true) {
    for (let pick of [coPicker, gradePicker, semPicker]) pick[lock?"setAttribute":"removeAttribute"]("disabled", "");
}

function getPicks() {
    return {
        co: +coPicker.value,
        grade: +gradePicker.value,
        sems: JSON.parse(semPicker.value)
    };
}

for (let pick of [coPicker, gradePicker, semPicker]) {
    pick.addEventListener("change", loadTable);
}

function courseTypeInt(courseObj) {
    const MTLdepts = [
        "BG", "CH", "CL", 
        "GJ", "GM", "UD",
        "HD", "JP", "MH",
        "ML", "PJ", "TH", "TL"
    ];    

    if (courseObj.type.includes("Core")) {
        if (MTLdepts.includes(courseObj.department.trim())) return 5;
        else return 1;
    } else if (courseObj.type.includes("Elective")) {
        return 2;
    } else if (courseObj.type.includes("Enrichment")) {
        return 3;
    } else if (courseObj.type.includes("Honours")) {
        return 4;
    } else {
        return 0;
    }
}

function isMajor(courseObj) {
    return !!courseObj.type.match(/\(Major\)/i)
}

function isSemOk(posSem, accept2=false) {
    // Calling with accept2 = true means that you're searching for Sem 1 and 2 courses (half- or full-year)
    // Calling with accept2 = false means that only Sem-1 only courses and full-year courses included
    // Return value: true for ok, false for not ok, 1 for partial ok (full year course for sem 1 only)
    posSem = posSem.toString().trim();
    if (posSem === "1") {
        return true;
    } else if (posSem === "2") {
        return !!accept2;
    } else if (posSem === "1 or 2") {
        return true;
    } else if (posSem === "1 and 2") {
        return accept2 ? true : 1;
    }
}

function isGradeOk(posGrade, checkGrade) {
    return posGrade.toString().indexOf(checkGrade) !== -1;
}

function isGPAd(courseObj) {
    return [1, 2, 5].includes(courseTypeInt(courseObj)) && courseObj.department !== "DV";
}

function genTableRow(courseObj) {
    const newTd = (x) => {
        let td = document.createElement("td");
        if (x !== undefined && x !== null) td.textContent = x.toString().trim();
        return td;
    }

    const row = document.createElement("tr");
    row.setAttribute("data-course-id", courseObj.code.trim());
    row.setAttribute("data-course-type", courseTypeInt(courseObj));

    const isBridging = !!courseObj.title.match(/\bbridging\b/i);

    const isCourseGPAd = isGPAd(courseObj) || isBridging;

    const checkboxHolder = newTd();
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkboxHolder.append(checkbox);
    checkbox.checked = courseTypeInt(courseObj) === 1 && courseObj.department !== "DV" && !isMajor(courseObj);
    checkbox.disabled = !isCourseGPAd && !checkbox.checked && !isBridging;
    checkbox.addEventListener("change", calculateGPA);
    checkbox.classList.add("include-course-check");

    const codeHolder = newTd(courseObj.code);

    const nameHolder = newTd(courseObj.title);

    const typeHolder = newTd(courseObj.type);

    const unitHolder = newTd(+courseObj.mcs);

    const gpaHolder = newTd();
    if (isCourseGPAd) {
        const gpaInput = document.createElement("select");
        gpaInput.classList.add("your-gp");
        const newOpt = x => {
            const o = document.createElement("option");
            o.textContent = x;
            return o;
        }
        for (let i=5; i>=0; i-=.5) {
            if (i === .5) continue; // There is literally no way you can get 0.5 points for a course
            gpaInput.append(newOpt(i.toFixed(1)));
            gpaInput.lastElementChild.setAttribute("value", i.toFixed(1));
        }
        gpaInput.lastElementChild.setAttribute("selected", "");
        gpaHolder.append(gpaInput);
        gpaInput.addEventListener("change", () => { checkbox.checked = true; });
        gpaInput.addEventListener("change", calculateGPA);
    } else {
        gpaHolder.append("N/A");
    }

    row.append(checkboxHolder, codeHolder, nameHolder, typeHolder, unitHolder, gpaHolder);

    return row;

}

async function loadTable() {
    lockInput(true);
    mainTable.innerHTML = "";
    const {co, grade, sems} = getPicks();

    let posData;
    if (posCache[co.toString()]) posData = posCache[co.toString()];
    else posCache[co] = posData = await fetch(`https://gohjy.github.io/nush-pos-data/data/${co}/pos.json`).then(x => x.json());

    posData.sort((a, b) => {
        let aC = courseTypeInt(a);
        let bC = courseTypeInt(b);
        return (aC*2+isMajor(a)) - (bC*2+isMajor(b));
    });

    console.log(posData);
    
    let applicableCourses = posData.filter(x => isGradeOk(x.level, grade) && isSemOk(x.sem, sems.includes(2)));

    console.log(applicableCourses);

    for (let course of applicableCourses) {
        mainTable.append(genTableRow(course));
    }

    lockInput(false);
}

await loadTable();

function calculateGPA() {
    let totalGradePoints = 0;
    let totalUnits = 0;

    const rows = document.querySelectorAll('#course-list tr');

    const {co, grade, sems} = getPicks();

    for (let row of rows) {
        const courseType = row.dataset.courseType;
        const courseID = row.dataset.courseId;
        const include = !!row.querySelector(":scope .include-course-check").checked;
        
        if (!include) {
            continue;
        }
        
        const picker = row.querySelector(":scope > td > .your-gp");
        if (!picker) {
            continue; // Doesn't count into GPA
        }

        const courseData = posCache[co.toString()]?.find(x => x.code === courseID);
        if (!courseData) {
            document.getElementById('gpa-value').textContent = "??";
            return false;
        }

        const units = courseData.mcs;
        
        const gradePoint = parseFloat(picker.value);

        // Only include valid numbers for calculation
        if (!Number.isNaN(gradePoint)) {
            totalGradePoints += (gradePoint * units);
            totalUnits += units;
        }
    };

    let gpa = 0;
    if (totalUnits > 0) {
        gpa = totalGradePoints / totalUnits;
    }

    document.getElementById('gpa-value').textContent = gpa.toFixed(2); // Display GPA to 2 decimal places
}

calculateGPA();
