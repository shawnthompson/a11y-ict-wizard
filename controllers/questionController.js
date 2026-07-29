const async = require('async');
const mongoose = require('mongoose');
const mammoth = require('mammoth');
const { JSDOM } = require('jsdom');

const Question = require('../models/questionSchema'); 
const Clause = require('../models/clauseSchema');
const toClauseTree = require('./clauseTree');

const strings = {
  listTitle: 'Edit questions',
  createTitle: 'Create question',
  questionNameRequired: 'Question name required'
}

exports.question_json_restore_post =(req, res, next) => {
  const JavaQuestionFile = req.body;

  function convertToMongoFormat(javaContent) {
    try {
      return javaContent.map(item => { 
        if (item._id && item._id.$oid) {
          let questionOID = item._id.$oid
          item._id = mongoose.Types.ObjectId(questionOID);
        }
        
        item.clauses = item.clauses.map(clause => mongoose.Types.ObjectId(clause.$oid));
        return item;
      });
    } catch (err) {
        console.log('Error in convertToMongoFormat:', err);
        throw err;
    }
  }

  const formattedData = convertToMongoFormat(JavaQuestionFile);

  // Function to update MongoDB collection
  async function updateQuestionCollection() {

    try {
      await Question.deleteMany({});
      await Question.insertMany(JavaQuestionFile);

      return true;
    } catch (err) {
      console.log('Error updating data:', err);
    }
  }

  updateQuestionCollection()
    .then(() => res.json({ message: 'Data updated successfully. Please note that when you close this modal the page will refresh to show the updated data.', success: true  }))
    .catch((err) => res.status(500).json({ message: 'Error updating data.', success: false }));
}


exports.question_json_get = (req, res, next) => {
  Question.find()
  .sort([['order', 'ascending']])
  .lean()
  .exec((err, questions) => {
    if (err) {
      console.error(err);
      return next(err);
    }
    
    const transformedQuestions = questions.map(question => {
      question._id = { "$oid": question._id.toString() };
      question.clauses = question.clauses.map(clause => ({ "$oid": clause.toString() }));

      return question;
    });

    const questionsData = JSON.stringify(transformedQuestions, null, 2); // Adding null, 2 for pretty printing

    
    // Send the data as a downloadable file
    res.setHeader('Content-disposition', 'attachment; filename=questions_list.json');
    res.send(questionsData);
  });
};

// Display list of all Questions
exports.question_list = (req, res, next) => {
  Question.find()
    .sort([['order', 'ascending']])
    .exec((err, list_questions) => {
      if (err) { return next(err); }
      res.render('question_item_list', {
        title: strings.listTitle,
        item_list: list_questions,
        breadcrumbs: [
          { url: '/', text: 'Home' },
          { url: '/edit', text: 'Edit content' }
        ]
      });
    });
};

// Display question create form on GET
exports.question_create_get = (req, res, next) => {
  Clause.find()
    .exec((err, results) => {
      if (err) { return next(err); }
      res.render('question_form', {
        title: strings.createTitle,
        clause_tree: toClauseTree(results),
        breadcrumbs: [
          { url: '/', text: 'Home' },
          { url: '/edit', text: 'Edit content' },
          { url: '/edit/questions', text: 'Edit questions' },
        ]
      });
    });
};

// Handle Question create on POST
exports.question_create_post = (req, res, next) => {

  // Edge case: < 2 clauses selected
  if (!(req.body.clauses instanceof Array)) {
    if (typeof req.body.clauses === 'undefined') {
      req.body.clauses = [];
    } else {
      req.body.clauses = new Array(req.body.clauses);
    }
  }

  let question = new Question({
    name: req.body.name,
    frName: req.body.frName,
    description: req.body.description,
    frDescription: req.body.frDescription,
    clauses: req.body.clauses,
    order: req.body.order,
    onlyIf: req.body.onlyIf === 'on',
    isUber: req.body.isUber === 'on',
    isUnique: req.body.isUnique === 'on'
  });

  // Check if Question with same name already exists.
  Question.findOne({ 'name': req.body.name })
    .exec((err, found_question) => {
      if (err) { return next(err); }
      if (found_question) { res.redirect(found_question.url); }
      else {
        question.save((err) => {
          if (err) { return next(err); }
          // Question saved. Redirect to questions list.
          res.redirect('/edit/questions');
        });
      }
    });
};

// Display question update form on GET
exports.question_update_get = (req, res, next) => {

  // Get question for form
  async.parallel({
    question: (callback) => Question.findById(req.params.id).exec(callback),
    clauses: (callback) => Clause.find().exec(callback)
  }, (err, results) => {
    if (err) { return next(err); }
    if (results.question == null) { // No results.
      let err = new Error('Question not found');
      err.status = 404;
      return next(err);
    }
    results.clauses = results.clauses.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    res.render('question_form', {
      title: 'Edit question',
      item: results.question,
      clause_tree: toClauseTree(results.clauses),
      breadcrumbs: [
        { url: '/', text: 'Home' },
        { url: '/edit', text: 'Edit content' },
        { url: '/edit/questions', text: 'Edit questions' },
      ]
    });
  });
};

// Handle question update on POST.
exports.question_update_post = (req, res, next) => {

  // Edge case: < 2 clauses selected
  if (!(req.body.clauses instanceof Array)) {
    if (typeof req.body.clauses === 'undefined') {
      req.body.clauses = [];
    } else {
      req.body.clauses = new Array(req.body.clauses);
    }
  }

  // Create a question object with escaped/trimmed data and old id.
  let question = new Question({
    name: req.body.name,
    frName: req.body.frName,
    description: req.body.description,
    frDescription: req.body.frDescription,
    clauses: req.body.clauses,
    order: req.body.order,
    onlyIf: req.body.onlyIf === 'on',
    isUber: req.body.isUber === 'on',
	isUnique: req.body.isUnique === 'on',
    _id: req.params.id // This is required, or a new ID will be assigned
  });

  Question.findByIdAndUpdate(req.params.id, question, {}, (err, thequestion) => {
    if (err) { return next(err); }
    // Successful - redirect to questions list
    res.redirect('/edit/questions');
  });
};


// Display Question delete form on GET.
exports.question_delete_get = (req, res, next) => {
  async.parallel({
    question: (callback) => Question.findById(req.params.id).exec(callback)
  }, (err, results) => {
    if (err) { return next(err); }
    if (results.question == null) { // No results.
      res.redirect('/edit/questions');
    }
    res.render('item_delete', {
      title: 'Delete Question',
      item: results.question,
      breadcrumbs: [
        { url: '/', text: 'Home' },
        { url: '/edit', text: 'Edit content' },
        { url: '/edit/questions', text: 'Edit questions' },
        { url: results.question.url, text: results.question.name }
      ]
    });
  });
};

// Handle Question delete on POST.
exports.question_delete_post = (req, res, next) => {
  async.parallel({
    question: (callback) => Question.findById(req.body.itemid).exec(callback)
  }, (err, results) => {
    if (err) { return next(err); }
    // Success. Delete object and redirect to the list of questions.
    Question.findByIdAndRemove(req.body.itemid, (err) => {
      if (err) { return next(err); }
      res.redirect('/edit/questions')
    })
  });
};

// Display question loader form on GET
exports.question_loader_get = (req, res, next) => {
  res.render('question_loader', {
    title: 'Bulk question loader',
    breadcrumbs: [
      { url: '/', text: 'Home' },
      { url: '/edit', text: 'Edit content' },
      { url: '/edit/question_loader', text: 'Bulk question loader' }
    ]
  });
};

function extractPlainText(cellElement) {
  if (!cellElement) return '';
  return (cellElement.textContent || '').trim();
}

function extractCellHtml(cellElement) {
  if (!cellElement) return '';
  return (cellElement.innerHTML || '').trim();
}

function toQuestionUpdateRow(cells) {
  if (!cells || cells.length < 5) return null;

  return {
    name: extractPlainText(cells[1]),
    frName: extractPlainText(cells[2]),
    description: extractCellHtml(cells[3]),
    frDescription: extractCellHtml(cells[4])
  };
}

function isQuestionDataRow(row) {
  if (!row || !row.name) return false;
  return row.name.toLowerCase() !== 'name';
}

async function parseQuestionRowsFromWordFile(file) {
  const htmlResult = await mammoth.convertToHtml({ buffer: file.buffer }, {
    includeDefaultStyleMap: true,
    preserveEmptyParagraphs: false
  });

  const dom = new JSDOM(htmlResult.value);
  const firstTable = dom.window.document.querySelector('table');
  if (!firstTable) {
    throw new Error('No table was found in the uploaded Word document.');
  }

  const rows = Array.from(firstTable.querySelectorAll('tr'));
  return rows
    .map((rowElement) => {
      const cells = Array.from(rowElement.querySelectorAll('td'));
      return toQuestionUpdateRow(cells);
    })
    .filter(isQuestionDataRow);
}

async function updateQuestionsFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { updatedCount: 0, missingNames: [] };
  }

  const missingNames = [];
  let updatedCount = 0;

  for (const row of rows) {
    const updatedQuestion = await Question.findOneAndUpdate(
      { name: row.name },
      {
        $set: {
          frName: row.frName,
          description: row.description,
          frDescription: row.frDescription
        }
      },
      { new: true }
    ).exec();

    if (updatedQuestion) {
      updatedCount += 1;
    } else {
      missingNames.push(row.name);
    }
  }

  return {
    updatedCount,
    missingNames: [...new Set(missingNames)]
  };
}

function buildQuestionLoaderMessage(updatedCount, totalRows, missingNames) {
  if (totalRows === 0) {
    return 'The first table did not contain any question rows to process.';
  }

  if (missingNames.length === 0) {
    return `Processed ${totalRows} rows. Updated ${updatedCount} question records.`;
  }

  return `Processed ${totalRows} rows. Updated ${updatedCount} question records. No matching question was found for: ${missingNames.join(', ')}.`;
}

// Handle question loader file upload on POST
exports.question_loader_post = async (req, res, next) => {
  const files = req.files;
  if (!files || !files.questionfile) {
    return res.status(400).send('A file is required');
  }
  const questionFile = files.questionfile[0];
  console.log('Question file:', questionFile.originalname, 'size:', questionFile.size);

  try {
    const rows = await parseQuestionRowsFromWordFile(questionFile);
    const { updatedCount, missingNames } = await updateQuestionsFromRows(rows);
    const message = buildQuestionLoaderMessage(updatedCount, rows.length, missingNames);

    res.json({ message });
  } catch (err) {
    next(err);
  }
};