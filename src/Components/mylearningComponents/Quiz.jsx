import React from "react";
import { ListGroup } from "react-bootstrap";

function Quiz() {
  return (
    <div>
      <h6>Interactive Quiz</h6>
      <ListGroup className="mt-3">
        <ListGroup.Item>1. What is Newton’s Second Law?</ListGroup.Item>
        <ListGroup.Item>2. Define force in terms of mass and acceleration.</ListGroup.Item>
        <ListGroup.Item>3. What is the unit of force?</ListGroup.Item>
      </ListGroup>
    </div>
  );
}

export default Quiz;
