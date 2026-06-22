import { describe, it, expect, jest } from '@jest/globals';
import { skills, findSkill, parseSkillCommand } from '../opencode/skills.js';

describe('skills', () => {
  describe('skills', () => {
    it('should export skill definitions', () => {
      expect(skills).toBeInstanceOf(Array);
      expect(skills.length).toBeGreaterThan(0);
    });

    it('should have skills with required properties', () => {
      skills.forEach((skill) => {
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('command');
        expect(skill).toHaveProperty('description');
        expect(skill).toHaveProperty('handler');
      });
    });

    it('should have commands starting with /stack-control:', () => {
      skills.forEach((skill) => {
        expect(skill.command).startsWith('/stack-control:');
      });
    });
  });

  describe('findSkill', () => {
    it('should find skill by name', () => {
      const skill = findSkill('define');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('define');
    });

    it('should return undefined for unknown skill', () => {
      const skill = findSkill('unknown');
      expect(skill).toBeUndefined();
    });
  });

  describe('parseSkillCommand', () => {
    it('should parse skill command with args', () => {
      const result = parseSkillCommand('/stack-control:define arg1 arg2');
      expect(result).toEqual({
        skill: 'define',
        args: ['arg1', 'arg2'],
      });
    });

    it('should parse skill command without args', () => {
      const result = parseSkillCommand('/stack-control:define');
      expect(result).toEqual({
        skill: 'define',
        args: [],
      });
    });

    it('should return null for invalid command', () => {
      const result = parseSkillCommand('/other:define');
      expect(result).toBeNull();
    });
  });
});
