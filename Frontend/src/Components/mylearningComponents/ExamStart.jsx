import React, { useEffect, useState } from 'react'
import { Card, Button, Container } from "react-bootstrap";
import './Examstart.css'
import "./ExamSection.css";
import Toast from 'react-bootstrap/Toast';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../api/apiClient';

const ExamStart = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const lessonId = location.state?.lessonId || null;

    const [correctanswers, setcorrectanswers] = useState(0);
    const [show, setShow] = useState(false);
    const [exam, setexam] = useState([]);
    const [answersChosen, setAnswersChosen] = useState([]);
    const [locked, setLocked] = useState([]);
    const [result, setResult] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [scoreSaved, setScoreSaved] = useState(false);

    const examfinished = () => locked.length > 0 && locked.every(l => l === true);

    const showtoast = async () => {
        if (!examfinished()) {
            alert("Complete Your Exam");
            return;
        }
        setShow(true);

        // Save exam_score to the database
        if (lessonId && !scoreSaved) {
            const scorePercent = Math.round((correctanswers / exam.length) * 100);
            try {
                await apiClient.put(`/user-lessons/${lessonId}`, {
                    exam_score: scorePercent,
                    practice_completed: true,
                });
                setScoreSaved(true);
            } catch (err) {
                console.error("Failed to save exam score:", err);
            }
        }
    };

    const chooseAnswer = (index, option) => {
        if (locked[index]) return;
        const updated = [...answersChosen];
        updated[index] = option;
        setAnswersChosen(updated);
    };

    const reviewAnswer = (index) => {
        if (locked[index]) return;
        const correct =
            answersChosen[index]?.toString().trim().toLowerCase() ===
            exam[index].solution?.toString().trim().toLowerCase();
        if (correct) setcorrectanswers(prev => prev + 1);

        const newResult = [...result];
        newResult[index] = correct;
        setResult(newResult);

        const newLocked = [...locked];
        newLocked[index] = true;
        setLocked(newLocked);
    };

    useEffect(() => {
        const fetchExam = async () => {
            setLoading(true);
            setError(null);
            try {
                if (lessonId) {
                    const res = await apiClient.get(`/ai-generations/lesson/${lessonId}?type=exam`);
                    if (res.data.length > 0) {
                        const questions = JSON.parse(res.data[0].content);
                        setexam(Array.isArray(questions) ? questions : []);
                    } else {
                        setError("No exam has been generated for this lesson yet.");
                    }
                } else {
                    setError("No lesson selected.");
                }
            } catch (err) {
                console.error("Failed to fetch exam:", err);
                setError("Could not load exam. Please try again later.");
            } finally {
                setLoading(false);
            }
        };
        fetchExam();
    }, [lessonId]);

    useEffect(() => {
        if (exam.length > 0) {
            setAnswersChosen(Array(exam.length).fill(null));
            setLocked(Array(exam.length).fill(false));
            setResult(Array(exam.length).fill(null));
            setcorrectanswers(0);
            setScoreSaved(false);
        }
    }, [exam]);

    return (
        <>
            <Container className="py-5">
                <h2 className="mb-4">Exam</h2>

                {loading && <div className="text-muted">Loading exam...</div>}
                {error && <div className="alert alert-warning">{error}</div>}

                {!loading && !error && exam.map((part, index) => (
                    <Card className="shadow-sm cardexam" key={index}>
                        <Card.Body>
                            <div className="d-flex justify-content-between mb-3">
                                <span>Question {index + 1} / {exam.length}</span>
                            </div>
                            <h5 className="mb-3">{part.question}</h5>
                            <ul className="list-group">
                                {['a', 'b', 'c', 'd'].map(opt => (
                                    <li
                                        key={opt}
                                        className={`list-group-item ${answersChosen[index] === opt ? "clicked" : "notclicked"}`}
                                        onClick={() => !locked[index] && chooseAnswer(index, opt)}
                                    >
                                        {opt.toUpperCase()}) {part[opt]}
                                    </li>
                                ))}
                            </ul>
                            <button onClick={() => reviewAnswer(index)} className='answerbutton'>Check Answer</button>
                            {result[index] === true && <div className='answerdivc'>Correct Answer ✔</div>}
                            {result[index] === false && (
                                <div className='answerdivw'>Wrong Answer. The correct answer is {part.solution}</div>
                            )}
                        </Card.Body>
                    </Card>
                ))}

                {!loading && !error && exam.length > 0 && (
                    <Button variant="primary" onClick={showtoast}>Show Result</Button>
                )}

                <Toast onClose={() => setShow(false)} show={show} delay={4000} autohide>
                    <Toast.Header>
                        <strong className="me-auto">Result</strong>
                    </Toast.Header>
                    <Toast.Body>
                        Your Grade is {correctanswers}/{exam.length} ({Math.round((correctanswers / exam.length) * 100)}%)
                        {scoreSaved && " ✅ Saved!"}
                    </Toast.Body>
                </Toast>

                <Button variant="secondary" className='btns' onClick={() => navigate("/lesson", { state: location.state })}>
                    Return to Session
                </Button>
            </Container>
        </>
    );
};

export default ExamStart;